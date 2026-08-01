import { loadEnvConfig } from "@next/env";
import pino from "pino";
import {
  dueCadence,
  localClock,
  periodKeyFor,
  runHeartbeatForUser,
  tickHeartbeat,
} from "../../src/heartbeat/scheduler";
import { prisma } from "../../src/lib/db";

loadEnvConfig(process.cwd());

const log = pino({ level: process.env.LOG_LEVEL || "info" });
const TICK_MS = 60_000;

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** Manual run for testing: --once [--user <id>] [--cadence daily|weekly]. */
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
    requested === "weekly" || requested === "daily"
      ? requested
      : (dueCadence({ clock, heartbeatHour: clock.hour }) ?? "daily");
  const periodKey = periodKeyFor(cadence, clock.isoDate);

  const existing = await prisma.aiInsight.findFirst({
    where: { userId, periodKey },
    select: { id: true },
  });
  if (existing) {
    log.info({ userId, periodKey }, "Sudah ada insight untuk periode ini — dilewati");
    return;
  }

  const outcome = await runHeartbeatForUser({ userId, cadence, periodKey });
  log.info({ userId, periodKey, cadence, outcome }, "Heartbeat manual selesai");
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
