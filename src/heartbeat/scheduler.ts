/**
 * Decides when a user is due for a heartbeat and runs one cycle end to end.
 *
 * Scheduling is done in each user's own timezone rather than a UTC cron, so
 * "pagi" is actually morning for them. Every cycle is keyed by a period so a
 * worker restart mid-morning cannot send the same brief twice.
 */

import pino from "pino";
import type { HeartbeatStatus } from "@prisma/client";
import { resolveAiConfig } from "@/ai/resolve-config";
import { requireAiAccess } from "@/ai/entitlement";
import type { HeartbeatPlan } from "@/ai/graph/compile";
import { loadHeartbeatPlan } from "@/ai/graph/store";
import { exportTransactionsCsv } from "@/finance-engine/export";
import { emitAgentEvent, newRunId } from "@/lib/agent-telemetry";
import { prisma } from "@/lib/db";
import { analyzeHeartbeat } from "./analyst";
import { dispatchHeartbeat } from "./dispatch";
import { markHeartbeatAlive } from "./liveness";
import { collectSnapshot } from "./signals";

const log = pino({ level: process.env.LOG_LEVEL || "info" });

export type Cadence = "daily" | "weekly" | "monthly";

/**
 * Hasil satu siklus, selalu dengan alasan yang bisa dibaca manusia.
 *
 * Dulu semua jalan buntu mengembalikan string "skipped" telanjang tanpa satu
 * baris log pun. Di platform baru — semua akun masih FREE — itu berarti setiap
 * user dibuang diam-diam dan tidak ada cara untuk tahu bedanya dengan worker
 * yang mati.
 */
export type HeartbeatOutcome = {
  status: "sent" | "saved" | "skipped" | "failed";
  reason?: string;
  /** Pesan asli di balik `reason` — dari penyedia LLM atau dari parser. */
  detail?: string;
};

const OUTCOME_TO_STATUS: Record<HeartbeatOutcome["status"], HeartbeatStatus> = {
  sent: "SENT",
  saved: "SAVED",
  skipped: "SKIPPED",
  failed: "FAILED",
};

/** Sesudah ini, sebuah klaim RUNNING dianggap milik proses yang sudah mati. */
const STALE_CLAIM_MS = 15 * 60_000;

/**
 * Kegagalan yang penyebabnya bisa hilang sendiri tanpa deploy.
 *
 * Ketiganya adalah gangguan atau salah konfigurasi yang biasanya dibereskan
 * dalam hitungan menit — provider pulih, admin menyimpan ulang API key,
 * model diganti di panel. Sisanya (`not-premium`, `nothing-worth-sending`)
 * adalah keputusan, bukan kegagalan, dan tidak boleh diulang.
 */
const RETRYABLE_REASONS = new Set(["no-api-key", "all-models-failed"]);

/** Jeda sebelum periode yang gagal boleh diambil lagi. */
const RETRY_AFTER_MS = 30 * 60_000;

/**
 * Batas percobaan per periode.
 *
 * Lima percobaan berjarak 30 menit menutup dua setengah jam pertama — cukup
 * untuk hampir semua gangguan penyedia dan untuk admin yang membetulkan
 * konfigurasi pagi itu. Lewat dari situ penyebabnya hampir pasti permanen, dan
 * mengulang terus hanya membakar token tanpa mengubah hasil.
 */
const MAX_ATTEMPTS = 5;

type LocalClock = { hour: number; isoDate: string; weekday: number; dayOfMonth: number };

function localClock(timezone: string, at: Date): LocalClock {
  const tz = timezone || "Asia/Jakarta";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    hour12: false,
    weekday: "short",
    day: "2-digit",
  }).formatToParts(at);

  const hourPart = parts.find((p) => p.type === "hour")?.value ?? "0";
  const weekdayPart = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const dayPart = parts.find((p) => p.type === "day")?.value ?? "1";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return {
    // "24" is a valid hour12:false output for midnight in some runtimes.
    hour: Number(hourPart) % 24,
    isoDate: at.toLocaleDateString("sv-SE", { timeZone: tz }),
    weekday: Math.max(0, weekdays.indexOf(weekdayPart)),
    dayOfMonth: Number(dayPart),
  };
}

/** ISO week key, e.g. 2026-W31 — stable across year boundaries. */
export function isoWeekKey(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Month key for the recap, e.g. 2026-07 — always the month that just closed. */
export function previousMonthKey(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(0); // day 0 of this month = last day of the previous one
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function periodKeyFor(cadence: Cadence, isoDate: string): string {
  if (cadence === "monthly") return `monthly:${previousMonthKey(isoDate)}`;
  return cadence === "weekly" ? `weekly:${isoWeekKey(isoDate)}` : `daily:${isoDate}`;
}

/**
 * Whether a user is due, given their local clock.
 *
 * The window opens at the configured hour and stays open for the rest of the
 * day. An exact `hour === target` match looked tidy but meant a worker restart,
 * a sleeping laptop, or one slow database tick silently skipped that day
 * forever — the reason heartbeat had never fired in production. Duplicates are
 * prevented by the period key, not by the narrowness of this window.
 *
 * Priority is monthly > weekly > daily: on the 1st, the recap replaces the
 * brief rather than arriving alongside it.
 */
export function dueCadence(params: {
  clock: LocalClock;
  heartbeatHour: number;
  /** Dari node "Penjadwal". Dihilangkan = ketiganya aktif, seperti sebelum ada kanvas. */
  cadences?: { daily: boolean; weekly: boolean; monthly: boolean };
}): Cadence | null {
  const cadences = params.cadences ?? { daily: true, weekly: true, monthly: true };
  if (params.clock.hour < params.heartbeatHour) return null;

  // Cadence yang dimatikan tidak memblokir yang di bawahnya: tanggal 1 dengan
  // laporan tutup bulan dimatikan harus tetap menerima brief harian, bukan diam.
  if (params.clock.dayOfMonth === 1 && cadences.monthly) return "monthly";
  if (params.clock.weekday === 1 && cadences.weekly) return "weekly";
  return cadences.daily ? "daily" : null;
}

export async function runHeartbeatForUser(params: {
  userId: string;
  cadence: Cadence;
  periodKey: string;
  /** Rencana dari Agent Studio. Dihilangkan = dimuat dari graph yang dipublish. */
  plan?: HeartbeatPlan;
}): Promise<HeartbeatOutcome> {
  const { userId, cadence, periodKey } = params;
  const plan = params.plan ?? (await loadHeartbeatPlan());

  const runId = newRunId();
  const runStartedAt = Date.now();
  const at = () => new Date().toISOString();
  const node = (
    kind: keyof typeof plan.nodeIds,
    status: "running" | "ok" | "skipped" | "error",
    detail?: string,
    ms?: number,
  ) => {
    const nodeId = plan.nodeIds[kind];
    if (!nodeId) return;
    emitAgentEvent({ type: "node", runId, nodeId, kind, status, ms, detail, at: at() });
  };
  const finish = (outcome: HeartbeatOutcome): HeartbeatOutcome => {
    emitAgentEvent({
      type: "run:end",
      runId,
      status: outcome.status === "failed" ? "error" : "ok",
      ms: Date.now() - runStartedAt,
      at: at(),
    });
    return outcome;
  };

  emitAgentEvent({
    type: "run:start",
    runId,
    track: "heartbeat",
    channel: cadence,
    at: at(),
  });

  // Diperiksa SEBELUM snapshot, bukan sesudah.
  //
  // Heartbeat adalah fitur Premium, dan akun FREE ditolak setiap kali. Urutan
  // lama tetap menjalankan collectSnapshot — delapan query paralel — lalu
  // membuang hasilnya. Dikalikan jumlah user dan diulang tiap menit, itu beban
  // database yang tidak menghasilkan apa pun.
  try {
    await requireAiAccess(userId, "HEARTBEAT");
  } catch {
    node("trigger.schedule", "skipped", "bukan Premium");
    return finish({ status: "skipped", reason: "not-premium" });
  }
  node("trigger.schedule", "ok", cadence);

  const signalsStartedAt = Date.now();
  const snapshot = await collectSnapshot(userId, cadence);
  node("signals.collect", "ok", undefined, Date.now() - signalsStartedAt);

  const config = await resolveAiConfig(userId);
  const analystStartedAt = Date.now();
  node("llm.analyst", "running", plan.analyst.modelOverride || config.model);
  const analysis = await analyzeHeartbeat({ snapshot, config, userId, analyst: plan.analyst });

  if (!analysis.ok) {
    node("llm.analyst", "error", analysis.detail ?? analysis.reason, Date.now() - analystStartedAt);
    return finish({ status: "skipped", reason: analysis.reason, detail: analysis.detail });
  }
  node(
    "llm.analyst",
    "ok",
    analysis.analysis.shouldSend ? "layak dikirim" : "tidak layak dikirim",
    Date.now() - analystStartedAt,
  );

  const wantsAttachment = cadence === "monthly" && plan.dispatch.monthlyAttachment;
  const attachment = wantsAttachment ? await buildMonthlyRecap(userId, periodKey) : undefined;

  // Analis boleh menjawab "tidak ada yang layak mengganggu user" tanpa menulis
  // satu kalimat pun. Diteruskan ke dispatch, itu akan menyimpan insight kosong
  // di dashboard — jadi siklusnya berhenti di sini, dengan alasan yang jelas.
  if (!analysis.analysis.shouldSend && !analysis.analysis.body && !attachment) {
    node("dispatch.notify", "skipped", "tidak ada yang perlu dikirim");
    return finish({ status: "skipped", reason: "nothing-worth-sending" });
  }
  // Rekap bulanan tetap harus berangkat meski analis tidak menulis apa-apa;
  // caption lampirannya sudah berisi angka yang sama, jadi dipakai sebagai isi
  // supaya insight yang tersimpan tidak kosong melompong.
  const payload =
    analysis.analysis.body || !attachment
      ? analysis.analysis
      : { ...analysis.analysis, title: "Rekap bulanan", body: attachment.caption };

  const result = await dispatchHeartbeat({
    userId,
    periodKey,
    analysis: payload,
    attachment,
    channels: { telegram: plan.dispatch.telegram, webPush: plan.dispatch.webPush },
  });

  const reached = result.telegram + result.push + (result.document ? 1 : 0);
  node(
    "dispatch.notify",
    "ok",
    reached > 0 ? `${reached} kanal` : "tersimpan tanpa notifikasi",
  );
  if (reached > 0) return finish({ status: "sent" });

  // Tersimpan tapi tidak sampai ke siapa pun. Tiga sebab yang sangat berbeda:
  // analis memutuskan tidak ada yang layak mengganggu user, user belum menautkan
  // satu kanal pun, atau admin memang mematikan semua kanal di Agent Studio.
  if (!analysis.analysis.shouldSend) {
    return finish({ status: "saved", reason: "nothing-worth-sending" });
  }
  const anyChannelOn = plan.dispatch.telegram || plan.dispatch.webPush;
  return finish({ status: "saved", reason: anyChannelOn ? "no-channel" : "channels-disabled" });
}

/**
 * Mengambil periode secara atomik lewat unique index (user_id, period_key).
 *
 * Klaim ditulis sebelum pekerjaan dimulai, bukan sesudah, supaya hasil apa pun —
 * termasuk skip dan crash — meninggalkan jejak. Itu yang membuat siklus ini
 * berhenti mengulang dirinya tiap 60 detik.
 */
async function claimPeriod(params: {
  userId: string;
  periodKey: string;
  cadence: Cadence;
  now: Date;
}): Promise<string | null> {
  const { userId, periodKey, cadence, now } = params;

  // Klaim yang tidak pernah melapor balik berarti prosesnya mati di tengah
  // siklus. Tanpa pembersihan ini periode tersebut terkunci selamanya dan user
  // tidak akan pernah menerima laporan lagi.
  await prisma.heartbeatRun.deleteMany({
    where: {
      userId,
      periodKey,
      status: "RUNNING",
      startedAt: { lt: new Date(now.getTime() - STALE_CLAIM_MS) },
    },
  });

  try {
    const claim = await prisma.heartbeatRun.create({
      data: { userId, periodKey, cadence, status: "RUNNING", startedAt: now },
      select: { id: true },
    });
    return claim.id;
  } catch (err) {
    // P2002 = periode ini sudah tercatat, entah selesai sebelumnya atau sedang
    // dikerjakan proses worker lain saat ini juga.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      return reclaimPeriod({ userId, periodKey, now });
    }
    throw err;
  }
}

/**
 * Mengambil ulang periode yang berakhir gagal transien.
 *
 * Klaim ditulis sebelum pekerjaan supaya hasil apa pun meninggalkan jejak — tapi
 * itu berarti gangguan penyedia sekali di jam kirim menghanguskan seluruh hari
 * itu, karena unique index memblokir percobaan berikutnya sampai periode
 * berganti. Persis yang terjadi di produksi: API key diperbaiki jam 6 lewat,
 * siklus jam 7 gagal, dan tidak ada satu pun laporan sampai besok paginya.
 */
async function reclaimPeriod(params: {
  userId: string;
  periodKey: string;
  now: Date;
}): Promise<string | null> {
  const { userId, periodKey, now } = params;

  const existing = await prisma.heartbeatRun.findUnique({
    where: { userId_periodKey: { userId, periodKey } },
    select: { id: true, status: true, reason: true, attempts: true, finishedAt: true },
  });
  if (!existing) return null;

  // RUNNING = proses lain sedang mengerjakannya (yang basi sudah dihapus di
  // atas). SENT/SAVED = selesai. SKIPPED hanya boleh diulang kalau alasannya
  // memang bisa hilang sendiri — keputusan analis tidak termasuk.
  const retryable =
    existing.status === "FAILED" ||
    (existing.status === "SKIPPED" && RETRYABLE_REASONS.has(existing.reason ?? ""));
  if (!retryable) return null;
  if (existing.attempts >= MAX_ATTEMPTS) return null;
  if (existing.finishedAt && now.getTime() - existing.finishedAt.getTime() < RETRY_AFTER_MS) {
    return null;
  }

  // updateMany dengan status lama di filter: dua worker yang sampai di sini
  // bersamaan hanya menyisakan satu pemenang, sisanya kena count 0.
  const taken = await prisma.heartbeatRun.updateMany({
    where: { id: existing.id, status: existing.status },
    data: {
      status: "RUNNING",
      startedAt: now,
      finishedAt: null,
      durationMs: null,
      attempts: { increment: 1 },
    },
  });
  if (taken.count === 0) return null;

  log.info(
    { userId, periodKey, attempt: existing.attempts + 1, previous: existing.reason },
    "Periode heartbeat dicoba ulang",
  );
  return existing.id;
}

async function finishRun(id: string, outcome: HeartbeatOutcome, startedAtMs: number) {
  await prisma.heartbeatRun
    .update({
      where: { id },
      data: {
        status: OUTCOME_TO_STATUS[outcome.status],
        reason: outcome.reason ?? null,
        detail: outcome.detail ?? null,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAtMs,
      },
    })
    .catch((err) => log.warn({ err, id }, "Gagal menandai hasil heartbeat"));
}

/**
 * Spreadsheet of the month that just closed.
 *
 * Skipped when the month had no activity — an empty file is noise, and the
 * analyst's text alone already says nothing happened.
 */
async function buildMonthlyRecap(userId: string, periodKey: string) {
  const monthKey = periodKey.replace("monthly:", "");
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return undefined;

  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const exported = await exportTransactionsCsv(userId, from, to, monthKey);
  if (exported.rowCount === 0) return undefined;

  const monthName = from.toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const summary = exported.totals
    .map(
      (t) =>
        `${t.currency}: masuk ${t.income.toLocaleString("id-ID")}, keluar ${t.expense.toLocaleString("id-ID")}`,
    )
    .join(" | ");

  return {
    filename: exported.filename,
    content: exported.csv,
    caption: `📊 Rekap ${monthName} — ${exported.rowCount} transaksi\n${summary}`,
  };
}

/** One scheduler tick: finds users whose local clock just hit their heartbeat hour. */
export async function tickHeartbeat(now = new Date()): Promise<number> {
  // Dimuat sekali per tick, bukan per user: satu tick adalah satu keputusan
  // penjadwalan, dan graph yang berubah di tengahnya akan membuat sebagian user
  // dijadwalkan dengan aturan lama dan sebagian dengan aturan baru.
  const plan = await loadHeartbeatPlan();

  const settings = await prisma.userSettings.findMany({
    where: { heartbeatEnabled: true },
    select: { userId: true, timezone: true, heartbeatHour: true },
  });

  let ran = 0;

  for (const setting of settings) {
    const clock = localClock(setting.timezone, now);
    // Jam pilihan user selalu menang; jam dari node hanya menutup baris lama
    // yang nilainya di luar rentang jam.
    const hour =
      Number.isInteger(setting.heartbeatHour) &&
      setting.heartbeatHour >= 0 &&
      setting.heartbeatHour <= 23
        ? setting.heartbeatHour
        : plan.schedule.defaultHour;
    const cadence = dueCadence({
      clock,
      heartbeatHour: hour,
      cadences: {
        daily: plan.schedule.daily,
        weekly: plan.schedule.weekly,
        monthly: plan.schedule.monthly,
      },
    });
    if (!cadence) continue;

    const periodKey = periodKeyFor(cadence, clock.isoDate);

    // Penjaga duplikat dulu membaca baris AiInsight, yang hanya lahir kalau
    // siklusnya sukses penuh — jadi setiap skip lolos dan diulang tiap menit.
    const claimId = await claimPeriod({ userId: setting.userId, periodKey, cadence, now });
    if (!claimId) continue;

    const startedAtMs = Date.now();
    try {
      const outcome = await runHeartbeatForUser({
        userId: setting.userId,
        cadence,
        periodKey,
        plan,
      });
      await finishRun(claimId, outcome, startedAtMs);
      log.info(
        {
          userId: setting.userId,
          periodKey,
          status: outcome.status,
          reason: outcome.reason,
          detail: outcome.detail,
        },
        "Siklus heartbeat selesai",
      );
      if (outcome.status !== "skipped") ran += 1;
    } catch (err) {
      const reason = err instanceof Error ? err.message.slice(0, 300) : "unknown";
      await finishRun(claimId, { status: "failed", reason }, startedAtMs);
      log.error({ err, userId: setting.userId, periodKey }, "Siklus heartbeat gagal");
    } finally {
      // Worker hanya menulis tanda hidup di antara dua tick, dan TTL-nya 150
      // detik. Satu tick dengan beberapa user yang masing-masing memakai
      // anggaran waktunya sudah cukup melewati TTL itu — panel /system lalu
      // melaporkan worker mati justru saat ia sedang bekerja paling keras.
      await markHeartbeatAlive();
    }
  }

  return ran;
}

export { localClock };
