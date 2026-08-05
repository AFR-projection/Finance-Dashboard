import { loadEnvConfig } from "@next/env";
import pino from "pino";
import {
  dueCadence,
  localClock,
  periodKeyFor,
  runHeartbeatForUser,
  tickHeartbeat,
} from "../../src/heartbeat/scheduler";
import { markHeartbeatAlive } from "../../src/heartbeat/liveness";
import { prisma } from "../../src/lib/db";

loadEnvConfig(process.cwd());

const log = pino({ level: process.env.LOG_LEVEL || "info" });
const TICK_MS = 60_000;

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** Manual run for testing: --once [--user <id>] [--cadence daily|weekly|monthly] [--force]. */
async function runOnce() {
  const userId = argValue("--user");
  if (!userId) {
    const count = await tickHeartbeat();
    log.info({ count }, "Tick manual selesai");
    return;
  }

  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  if (!settings) {
    log.error({ userId }, "User tidak punya settings");
    process.exitCode = 1;
    return;
  }

  const clock = localClock(settings.timezone, new Date());
  const requested = argValue("--cadence");
  const cadence =
    requested === "weekly" || requested === "daily" || requested === "monthly"
      ? requested
      : (dueCadence({ clock, heartbeatHour: clock.hour }) ?? "daily");
  const periodKey = periodKeyFor(cadence, clock.isoDate);

  // Penjaganya adalah HeartbeatRun, bukan AiInsight: sebuah siklus yang berakhir
  // skip tidak pernah menulis insight, jadi memakai insight sebagai penjaga
  // berarti periode itu dikerjakan ulang tanpa henti.
  const existing = await prisma.heartbeatRun.findUnique({
    where: { userId_periodKey: { userId, periodKey } },
    select: { status: true, reason: true },
  });
  if (existing && !process.argv.includes("--force")) {
    log.info(
      { userId, periodKey, status: existing.status, reason: existing.reason },
      "Periode ini sudah dikerjakan — dilewati (pakai --force untuk mengulang)",
    );
    return;
  }
  if (existing) {
    await prisma.heartbeatRun.delete({ where: { userId_periodKey: { userId, periodKey } } });
  }

  const startedAtMs = Date.now();
  const outcome = await runHeartbeatForUser({ userId, cadence, periodKey });
  await prisma.heartbeatRun.create({
    data: {
      userId,
      periodKey,
      cadence,
      status: outcome.status.toUpperCase() as "SENT" | "SAVED" | "SKIPPED" | "FAILED",
      reason: outcome.reason ?? null,
      detail: outcome.detail ?? null,
      finishedAt: new Date(),
      durationMs: Date.now() - startedAtMs,
    },
  });
  log.info(
    {
      userId,
      periodKey,
      cadence,
      status: outcome.status,
      reason: outcome.reason,
      detail: outcome.detail,
    },
    "Heartbeat manual selesai",
  );
}

async function main() {
  if (process.argv.includes("--once")) {
    await runOnce();
    await prisma.$disconnect();
    return;
  }

  log.info(`Heartbeat worker started (tick ${TICK_MS / 1000}s)`);

  // Sequential ticks: an overlapping run could pass the idempotency check twice
  // before the first one writes its insight.
  for (;;) {
    try {
      // Ditulis sebelum pekerjaan dan terlepas dari hasilnya: yang ditandai
      // adalah "proses ini hidup", bukan "ada laporan terkirim". Tick yang tidak
      // menemukan satu pun user jatuh tempo tetap harus terlihat sehat.
      await markHeartbeatAlive();
      await tickHeartbeat();
    } catch (err) {
      // Neon parks an idle database and the first knock after that always
      // fails while it wakes. That is expected on a free tier, so it is logged
      // as a one-line warning instead of a stack trace that looks like an outage.
      const unreachable =
        typeof err === "object" && err !== null && (err as { code?: string }).code === "P1001";
      if (unreachable) log.warn("Database sedang bangun (Neon idle) — tick dilewati");
      else log.error({ err }, "Tick heartbeat gagal");
    }
    await new Promise((resolve) => setTimeout(resolve, TICK_MS));
  }
}

main().catch((err) => {
  log.fatal({ err }, "Heartbeat worker berhenti");
  process.exitCode = 1;
});
