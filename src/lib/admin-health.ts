import { getAppConfigRaw } from "@/lib/app-config";
import { ADMIN_ROOM } from "@/lib/admin-realtime";
import { getSocketServer } from "@/lib/socket-server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";

export type HealthCheck = {
  key: string;
  label: string;
  status: "up" | "down" | "off";
  latencyMs: number | null;
  detail: string;
};

export type HealthRuntime = {
  uptimeSeconds: number;
  nodeVersion: string;
  memoryMb: number;
  env: string;
};

async function timed(fn: () => Promise<unknown>, timeoutMs = 4000) {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      }),
    ]);
    return { ok: true, ms: Date.now() - started };
  } catch {
    return { ok: false, ms: Date.now() - started };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function readHealth(): Promise<{ checks: HealthCheck[]; runtime: HealthRuntime }> {
  const cfg = await getAppConfigRaw();
  const io = getSocketServer();
  const cache = redis;
  const token = cfg.telegramBotToken;

  const [db, cacheResult, telegram] = await Promise.all([
    timed(() => prisma.$queryRaw`SELECT 1`),
    cache ? timed(() => cache.ping()) : Promise.resolve(null),
    token
      ? timed(() =>
          fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => {
            if (!r.ok) throw new Error("telegram");
            return r;
          }),
        )
      : Promise.resolve(null),
  ]);

  // The heartbeat worker is a separate process with no channel back here, so
  // liveness is inferred from the freshest row it could have written.
  const lastHeartbeat = await prisma.aiUsageLog.findFirst({
    where: { source: "HEARTBEAT" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const checks: HealthCheck[] = [
    {
      key: "database",
      label: "Database",
      status: db.ok ? "up" : "down",
      latencyMs: db.ms,
      detail: db.ok ? "Postgres merespons" : "Tidak merespons",
    },
    {
      key: "redis",
      label: "Redis",
      status: cacheResult === null ? "off" : cacheResult.ok ? "up" : "down",
      latencyMs: cacheResult?.ms ?? null,
      detail:
        cacheResult === null
          ? "Tidak dikonfigurasi — memakai memory store"
          : cacheResult.ok
            ? "Terhubung"
            : "Gagal ping",
    },
    {
      key: "telegram",
      label: "Bot Telegram",
      status: telegram === null ? "off" : telegram.ok ? "up" : "down",
      latencyMs: telegram?.ms ?? null,
      detail:
        telegram === null
          ? "Token belum diisi"
          : telegram.ok
            ? "API menjawab getMe"
            : "Token ditolak atau jaringan gagal",
    },
    {
      key: "realtime",
      label: "Socket.io",
      status: io ? "up" : "down",
      latencyMs: null,
      detail: io
        ? `${io.sockets.sockets.size} koneksi · ${io.sockets.adapter.rooms.get(ADMIN_ROOM)?.size ?? 0} konsol admin`
        : "Server socket tidak aktif di proses ini",
    },
    {
      key: "heartbeat",
      label: "Worker heartbeat",
      status: lastHeartbeat ? "up" : "off",
      latencyMs: null,
      detail: lastHeartbeat
        ? `Tulisan terakhir ${lastHeartbeat.createdAt.toLocaleString("id-ID")}`
        : "Belum pernah menulis laporan",
    },
  ];

  return {
    checks,
    runtime: {
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      env: process.env.NODE_ENV ?? "development",
    },
  };
}
