/**
 * Turns a heartbeat snapshot into guidance worth interrupting the user for.
 *
 * One non-streaming completion, no tools attached: there is nothing to write, and
 * without tools an accidental mutation is impossible. The model may only use the
 * figures handed to it, and it may decide the day is not worth a notification.
 */

import pino from "pino";
import type { AiRuntimeConfig } from "@/ai/agent";
import { recordAiUsage } from "@/ai/usage";
import { callOpenRouter } from "@/ai/openrouter";
import type { HeartbeatSnapshot } from "./signals";

const log = pino({ level: process.env.LOG_LEVEL || "info" });

export type HeartbeatAnalysis = {
  shouldSend: boolean;
  title: string;
  body: string;
  severity: "info" | "good" | "warning" | "critical";
  actions: string[];
};

/**
 * Kegagalan dibedakan, bukan disamakan jadi null.
 *
 * "Key belum diisi" adalah salah konfigurasi yang bisa diperbaiki admin dalam
 * satu menit; "semua model gagal" adalah gangguan penyedia. Keduanya dulu
 * terlihat identik dari luar, jadi panel admin tidak bisa memberi tahu yang
 * mana yang sedang terjadi.
 */
export type HeartbeatAnalysisResult =
  | { ok: true; analysis: HeartbeatAnalysis }
  | {
      ok: false;
      reason: "no-api-key" | "all-models-failed";
      /**
       * Pesan asli dari penyedia atau dari parser, satu baris per percobaan.
       *
       * Tanpa ini kegagalan hanya meninggalkan dua kata di kolom `reason`, dan
       * satu-satunya salinan penjelasannya ada di stdout container — yang di VPS
       * berarti tidak ada. "Semua model gagal" jadi sama tidak berguna dengan
       * senyap yang seharusnya digantikannya.
       */
      detail?: string;
    };

/**
 * Bagian config yang datang dari node "Analis LLM" di Agent Studio.
 *
 * Defaultnya wajib sama dengan angka yang dulu di-hardcode di file ini, supaya
 * instalasi yang belum pernah mem-publish graph berperilaku persis seperti dulu.
 */
export type HeartbeatAnalystSettings = {
  modelOverride: string;
  temperature: number;
  requestTimeoutMs: number;
  maxRetries: number;
  totalBudgetMs: number;
};

export const DEFAULT_ANALYST_SETTINGS: HeartbeatAnalystSettings = {
  modelOverride: "",
  temperature: 0.4,
  requestTimeoutMs: 45_000,
  maxRetries: 2,
  totalBudgetMs: 120_000,
};

const DAILY_BRIEF = `Tugasmu: brief pagi. Angkat maksimal 2 hal paling penting hari ini, lalu satu aksi konkret yang bisa dikerjakan hari ini.`;

const WEEKLY_BRIEF = `Tugasmu: rekap Senin. Ringkas pekan lalu (pemasukan, pengeluaran, apa yang berubah), lalu rencana pekan ini, lalu status goal. Tetap padat.`;

const MONTHLY_BRIEF = `Tugasmu: laporan tutup bulan. Ringkas bulan yang baru selesai — total masuk, total keluar, kategori terbesar, dan apakah membaik atau memburuk dibanding bulan sebelumnya. Tutup dengan satu fokus untuk bulan ini. File rekap transaksi dikirim terpisah sebagai lampiran, jadi jangan bilang kamu melampirkannya di teks.`;

const BRIEFS: Record<"daily" | "weekly" | "monthly", string> = {
  daily: DAILY_BRIEF,
  weekly: WEEKLY_BRIEF,
  monthly: MONTHLY_BRIEF,
};

function systemPrompt(cadence: "daily" | "weekly" | "monthly"): string {
  return `Kamu Ledgerly, chief of staff keuangan pribadi user. Kamu sedang menulis pesan proaktif — user tidak bertanya apa pun, jadi pesan ini harus benar-benar layak mengganggu mereka.

${BRIEFS[cadence]}

ATURAN ANGKA
- Hanya boleh memakai angka yang ada di data. Jangan menghitung ulang, jangan menaksir, jangan mengarang persentase.
- Format rupiah seperti Rp25.000. Sebut periode saat menyebut angka.
- Proyeksi adalah estimasi — sebut sebagai proyeksi, bukan fakta.

ATURAN KIRIM
- shouldSend=false kalau tidak ada yang benar-benar penting: tidak ada sinyal berarti, atau isinya cuma mengulang recentInsightTitles.
- Khusus cadence "monthly": shouldSend selalu true. Laporan tutup bulan adalah kiriman rutin yang memang diminta user, bukan gangguan.
- Jangan kirim peringatan yang sama dua hari berturut-turut dengan kalimat yang sama.
- Kalau kondisi keuangannya sehat, sesekali boleh kirim kabar baik — tapi jangan tiap hari.

GAYA
- Bahasa Indonesia, tenang, hangat, tanpa basa-basi. Tanpa sapaan template, tanpa "Sebagai AI", tanpa emoji berlebihan (maksimal satu).
- body maksimal 600 karakter, paragraf pendek atau bullet sederhana. Tanpa Markdown heading, tanpa tabel.
- title maksimal 60 karakter, spesifik, bukan "Update Keuangan".
- actions: 0–3 kalimat aksi, masing-masing konkret dan terukur.

Jawab HANYA satu objek JSON, tanpa penjelasan dan tanpa code fence:
{"shouldSend":boolean,"title":string,"body":string,"severity":"info"|"good"|"warning"|"critical","actions":string[]}`;
}

type ParseOutcome =
  | { ok: true; analysis: HeartbeatAnalysis }
  | { ok: false; error: string };

/** Cuplikan balasan mentah, cukup untuk mengenali bentuknya tanpa membanjiri log. */
function snippet(raw: string): string {
  const flat = raw.replace(/\s+/g, " ").trim();
  return flat.length > 160 ? `${flat.slice(0, 160)}…` : flat;
}

function parseAnalysis(raw: string): ParseOutcome {
  if (!raw.trim()) {
    return { ok: false, error: "content kosong (model kemungkinan menaruh jawabannya di field reasoning)" };
  }

  // Models still wrap JSON in prose or fences despite the instruction, so take
  // the outermost object rather than trusting the whole string.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return { ok: false, error: `bukan JSON: ${snippet(raw)}` };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { ok: false, error: `JSON rusak: ${snippet(raw)}` };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, error: `JSON bukan objek: ${snippet(raw)}` };
  }

  const obj = parsed as Record<string, unknown>;
  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const body = typeof obj.body === "string" ? obj.body.trim() : "";

  // "Tidak ada yang layak mengganggu user" adalah jawaban yang memang diminta
  // prompt, dan model yang menjawabnya sering tidak repot mengisi title/body.
  // Versi lama menolaknya sebagai balasan rusak, lalu mencoba seluruh rantai
  // fallback yang menjawab hal yang sama — sehingga keputusan normal tercatat
  // sebagai "semua model gagal" dan menghanguskan periode hari itu.
  if (!title || !body) {
    if (obj.shouldSend === false) {
      return {
        ok: true,
        analysis: { shouldSend: false, title: "", body: "", severity: "info", actions: [] },
      };
    }
    return { ok: false, error: `title/body kosong: ${snippet(raw)}` };
  }

  const severity = ["info", "good", "warning", "critical"].includes(String(obj.severity))
    ? (obj.severity as HeartbeatAnalysis["severity"])
    : "info";

  return {
    ok: true,
    analysis: {
      shouldSend: obj.shouldSend === true,
      title: title.slice(0, 80),
      body: body.slice(0, 900),
      severity,
      actions: Array.isArray(obj.actions)
        ? obj.actions
            .filter((a): a is string => typeof a === "string" && a.trim().length > 0)
            .slice(0, 3)
        : [],
    },
  };
}

/**
 * Reports why the cycle cannot produce anything rather than pushing a bland
 * template — a heartbeat the user learns to ignore is worse than no heartbeat.
 */
export async function analyzeHeartbeat(params: {
  snapshot: HeartbeatSnapshot;
  config: AiRuntimeConfig;
  /** Set to attribute token spend; heartbeat never consumes the user's quota. */
  userId?: string;
  /** Dari node "Analis LLM". Dihilangkan = pakai perilaku bawaan. */
  analyst?: HeartbeatAnalystSettings;
}): Promise<HeartbeatAnalysisResult> {
  const { snapshot, config } = params;
  const analyst = params.analyst ?? DEFAULT_ANALYST_SETTINGS;
  if (!config.apiKey) {
    log.warn(
      "Heartbeat dilewati: API key AI tidak tersedia. Cek panel admin /ai — kalau key sudah diisi, kemungkinan ENCRYPTION_KEY berubah sehingga key lama tidak bisa dibaca.",
    );
    return { ok: false, reason: "no-api-key" };
  }

  const primary = analyst.modelOverride || config.model;
  const models = [primary, ...(config.fallbackModels ?? []).filter((m) => m !== primary)];

  /**
   * Batas keras untuk seluruh analisis satu user.
   *
   * Ini bukan kenyamanan, ini isolasi. `tickHeartbeat` mengerjakan user secara
   * berurutan dalam satu proses; tanpa batas ini satu panggilan yang macet
   * menahan giliran setiap user berikutnya DAN menghentikan tulisan liveness
   * yang dibaca panel /system — worker sehat pun akan dilaporkan mati.
   */
  const deadlineAt = Date.now() + Math.max(0, analyst.totalBudgetMs);

  /**
   * Satu panggilan ke satu model.
   *
   * `jsonMode` dipisah sebagai parameter karena `response_format` adalah satu-
   * satunya perbedaan struktural antara jalur ini dan jalur chat yang terbukti
   * jalan dengan model yang sama. Sebagian penyedia di OpenRouter menerima
   * permintaannya dengan status 200 lalu mengabaikan atau merusak formatnya —
   * ditagih token, tapi isinya bukan JSON.
   */
  const callModel = async (
    model: string,
    jsonMode: boolean,
  ): Promise<
    { ok: true; analysis: HeartbeatAnalysis } | { ok: false; error: string; retryPlain: boolean }
  > => {
    const result = await callOpenRouter({
      apiKey: config.apiKey,
      title: "Ledgerly Heartbeat",
      timeoutMs: analyst.requestTimeoutMs,
      maxRetries: analyst.maxRetries,
      deadlineAt,
      body: {
        model,
        messages: [
          { role: "system", content: systemPrompt(snapshot.cadence) },
          {
            role: "user",
            content: `Data keuangan user (satu-satunya sumber angka):\n${JSON.stringify(snapshot, null, 1)}`,
          },
        ],
        temperature: analyst.temperature,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      },
    });

    if (!result.ok) {
      // 400 sering justru berarti model ini tidak mengenal `response_format`,
      // jadi khusus itu percobaan tanpa mode JSON masih masuk akal.
      return {
        ok: false,
        error: result.error,
        retryPlain: jsonMode && result.status === 400,
      };
    }

    const json = result.json as {
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    if (params.userId && json.usage) {
      await recordAiUsage({
        userId: params.userId,
        source: "HEARTBEAT",
        model,
        usage: {
          promptTokens: json.usage.prompt_tokens ?? 0,
          outputTokens: json.usage.completion_tokens ?? 0,
        },
      });
    }

    const parsed = parseAnalysis(json.choices?.[0]?.message?.content ?? "");
    if (parsed.ok) return parsed;
    return { ok: false, error: parsed.error, retryPlain: jsonMode };
  };

  const failures: string[] = [];

  for (const model of models) {
    if (Date.now() >= deadlineAt) {
      failures.push("batas waktu total analisis habis sebelum sisa model dicoba");
      break;
    }
    for (const jsonMode of [true, false]) {
      const attempt = await callModel(model, jsonMode);
      if (attempt.ok) return { ok: true, analysis: attempt.analysis };

      failures.push(`${model}${jsonMode ? "" : " (tanpa json_object)"} → ${attempt.error}`);
      log.warn({ model, jsonMode, error: attempt.error }, "Heartbeat: percobaan model gagal");
      if (!attempt.retryPlain) break;
    }
  }

  const detail = failures.join(" | ").slice(0, 500);
  log.error({ detail }, "Heartbeat dilewati: semua model gagal");
  return { ok: false, reason: "all-models-failed", detail };
}
