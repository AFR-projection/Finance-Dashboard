import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("health check timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Readiness probe: traffic is accepted only when required data services work. */
export async function GET() {
  const database = await withTimeout(prisma.$queryRaw`SELECT 1`, 3_000)
    .then(() => true)
    .catch(() => false);
  const redisReady = redis
    ? await withTimeout(redis.ping(), 3_000)
        .then(() => true)
        .catch(() => false)
    : process.env.DOCKER !== "1";
  const ok = database && redisReady;

  return NextResponse.json(
    {
      ok,
      service: "ledgerly",
      checks: { database, redis: redisReady },
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
