import { getAppConfigRaw } from "@/lib/app-config";
import { ADMIN_ROOM } from "@/lib/admin-realtime";
import { getSocketServer } from "@/lib/socket-server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { readHeartbeatAlive, type HeartbeatLiveness } from "@/heartbeat/liveness";

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

type LastHeartbeatRun = {
  startedAt: Date;
  status: string;
  reason: string | null;
} | null;

/** Tanpa Redis, sebuah run dalam rentang ini dianggap bukti worker masih jalan. */
const RECENT_RUN_MS = 10 * 60_000;

/**
 * Memisahkan "prosesnya jalan" dari "ada yang dikerjakan".
 *
 * Keduanya dulu satu sinyal, sehingga tidak ada bedanya antara worker yang mati
 * dan worker yang sehat tapi memang belum ada user jatuh tempo — padahal
 * tindakan admin untuk keduanya sama sekali berbeda.
 */
function describeHeartbeat(liveness: HeartbeatLiveness, lastRun: LastHeartbeatRun): HealthCheck {
  const activity = lastRun
    ? `Siklus terakhir ${lastRun.startedAt.toLocaleString("id-ID")} — ${lastRun.status.toLowerCase()}${lastRun.reason ? ` (${lastRun.reason})` : ""}`
    : "Belum ada siklus tercatat";

  if (liveness.known) {
    if (!liveness.alive) {
      return {
        key: "heartbeat",
        label: "Worker heartbeat",
        status: "down",
        latencyMs: null,
        detail: `Tidak ada tick dalam 2,5 menit terakhir. ${activity}`,
      };
    }
    const tick = liveness.lastTickAt
      ? `Tick terakhir ${liveness.lastTickAt.toLocaleTimeString("id-ID")}`
      : "Tick aktif";
    return {
      key: "heartbeat",
      label: "Worker heartbeat",
      status: "up",
      latencyMs: null,
      detail: `${tick}. ${activity}`,
    };
  }

  // Redis tidak dikonfigurasi (lazim di lokal). Kesegaran siklus adalah bukti
  // terbaik yang tersisa, dan status "off" jujur menyatakan kita tidak tahu.
  const recent = lastRun ? Date.now() - lastRun.startedAt.getTime() < RECENT_RUN_MS : false;
  return {
    key: "heartbeat",
    label: "Worker heartbeat",
    status: recent ? "up" : "off",
    latencyMs: null,
    detail: recent
      ? `${activity} (liveness tidak dipantau — Redis tidak aktif)`
      : `${activity}. Liveness tidak bisa dipastikan tanpa Redis.`,
  };
}

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

  // Worker heartbeat proses terpisah, jadi kabarnya datang lewat kunci Redis
  // yang dia tulis tiap tick — bukan disimpulkan dari jejak pekerjaan.
  //
  // Versi lama menebak dari baris aiUsageLog ber-source HEARTBEAT, yang hanya
  // ada kalau panggilan LLM sukses. Worker sehat yang melewati semua user
  // tampak persis seperti worker mati, dan itulah kenapa panel ini bertahun
  // bilang "Belum pernah menulis laporan" tanpa ada yang curiga prosesnya
  // memang tidak pernah dijalankan.
  const [liveness, lastRun] = await Promise.all([
    readHeartbeatAlive(),
    prisma.heartbeatRun.findFirst({
      orderBy: { startedAt: "desc" },
      select: { startedAt: true, status: true, reason: true },
    }),
  ]);

  const heartbeatCheck = describeHeartbeat(liveness, lastRun);

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
    heartbeatCheck,
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
