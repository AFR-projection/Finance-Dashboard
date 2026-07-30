/**
 * Decides when a user is due for a heartbeat and runs one cycle end to end.
 *
 * Scheduling is done in each user's own timezone rather than a UTC cron, so
 * "pagi" is actually morning for them. Every cycle is keyed by a period so a
 * worker restart mid-morning cannot send the same brief twice.
 */

import pino from "pino";
import { resolveAiConfig } from "@/ai/resolve-config";
import { prisma } from "@/lib/db";
import { analyzeHeartbeat } from "./analyst";
import { dispatchHeartbeat } from "./dispatch";
import { collectSnapshot } from "./signals";

const log = pino({ level: process.env.LOG_LEVEL || "info" });

export type Cadence = "daily" | "weekly";

type LocalClock = { hour: number; isoDate: string; weekday: number };

function localClock(timezone: string, at: Date): LocalClock {
  const tz = timezone || "Asia/Jakarta";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(at);

  const hourPart = parts.find((p) => p.type === "hour")?.value ?? "0";
  const weekdayPart = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return {
    // "24" is a valid hour12:false output for midnight in some runtimes.
    hour: Number(hourPart) % 24,
    isoDate: at.toLocaleDateString("sv-SE", { timeZone: tz }),
    weekday: Math.max(0, weekdays.indexOf(weekdayPart)),
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

export function periodKeyFor(cadence: Cadence, isoDate: string): string {
  return cadence === "weekly" ? `weekly:${isoWeekKey(isoDate)}` : `daily:${isoDate}`;
}

/**
 * The weekly recap replaces the daily brief on Monday instead of stacking on
 * top of it — two notifications in one morning is noise, not guidance.
 */
export function dueCadence(params: {
  clock: LocalClock;
  heartbeatHour: number;
}): Cadence | null {
  if (params.clock.hour !== params.heartbeatHour) return null;
  return params.clock.weekday === 1 ? "weekly" : "daily";
}

export async function runHeartbeatForUser(params: {
  userId: string;
  cadence: Cadence;
  periodKey: string;
}): Promise<"sent" | "saved" | "skipped"> {
  const { userId, cadence, periodKey } = params;

  const snapshot = await collectSnapshot(userId, cadence);
  const config = await resolveAiConfig(userId);
  const analysis = await analyzeHeartbeat({ snapshot, config });

  if (!analysis) return "skipped";

  const result = await dispatchHeartbeat({ userId, periodKey, analysis });
  return result.telegram + result.push > 0 ? "sent" : "saved";
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
