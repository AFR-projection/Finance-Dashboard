/**
 * Decides when a user is due for a heartbeat and runs one cycle end to end.
 *
 * Scheduling is done in each user's own timezone rather than a UTC cron, so
 * "pagi" is actually morning for them. Every cycle is keyed by a period so a
 * worker restart mid-morning cannot send the same brief twice.
 */

import pino from "pino";
import { resolveAiConfig } from "@/ai/resolve-config";
import { requireAiAccess } from "@/ai/entitlement";
import { exportTransactionsCsv } from "@/finance-engine/export";
import { prisma } from "@/lib/db";
import { analyzeHeartbeat } from "./analyst";
import { dispatchHeartbeat } from "./dispatch";
import { collectSnapshot } from "./signals";

const log = pino({ level: process.env.LOG_LEVEL || "info" });

export type Cadence = "daily" | "weekly" | "monthly";

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
}): Cadence | null {
  if (params.clock.hour < params.heartbeatHour) return null;
  if (params.clock.dayOfMonth === 1) return "monthly";
  return params.clock.weekday === 1 ? "weekly" : "daily";
}

export async function runHeartbeatForUser(params: {
  userId: string;
  cadence: Cadence;
  periodKey: string;
}): Promise<"sent" | "saved" | "skipped"> {
  const { userId, cadence, periodKey } = params;

  const snapshot = await collectSnapshot(userId, cadence);

  // Heartbeat is a Premium feature; FREE accounts are skipped silently rather
  // than nagged, since nobody asked for this message.
  try {
    await requireAiAccess(userId, "HEARTBEAT");
  } catch {
    return "skipped";
  }

  const config = await resolveAiConfig(userId);
  const analysis = await analyzeHeartbeat({ snapshot, config, userId });

  if (!analysis) return "skipped";

  const attachment = cadence === "monthly" ? await buildMonthlyRecap(userId, periodKey) : undefined;
  const result = await dispatchHeartbeat({ userId, periodKey, analysis, attachment });
  return result.telegram + result.push + (result.document ? 1 : 0) > 0 ? "sent" : "saved";
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
  const settings = await prisma.userSettings.findMany({
    where: { heartbeatEnabled: true },
    select: { userId: true, timezone: true, heartbeatHour: true },
  });

  let ran = 0;

  for (const setting of settings) {
    const clock = localClock(setting.timezone, now);
    const cadence = dueCadence({ clock, heartbeatHour: setting.heartbeatHour });
    if (!cadence) continue;

    const periodKey = periodKeyFor(cadence, clock.isoDate);
    const already = await prisma.aiInsight.findFirst({
      where: { userId: setting.userId, periodKey },
      select: { id: true },
    });
    if (already) continue;

    try {
      const outcome = await runHeartbeatForUser({ userId: setting.userId, cadence, periodKey });
      log.info({ userId: setting.userId, periodKey, outcome }, "Siklus heartbeat selesai");
      if (outcome !== "skipped") ran += 1;
    } catch (err) {
      log.error({ err, userId: setting.userId, periodKey }, "Siklus heartbeat gagal");
    }
  }

  return ran;
}

export { localClock };
