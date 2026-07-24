import Redis from "ioredis";

/**
 * Redis optional.
 * - Local tanpa Docker: biarkan REDIS_URL kosong → memory store
 * - Docker Compose: REDIS_URL=redis://redis:6379 + DOCKER=1 (atau production)
 */
function resolveRedisUrl(): string | null {
  const raw = process.env.REDIS_URL?.trim();
  if (!raw) return null;

  // Hostname "redis" hanya valid di dalam Docker network
  const isDockerDns = /^rediss?:\/\/redis(:|\/|$)/.test(raw);
  if (isDockerDns && process.env.DOCKER !== "1" && process.env.NODE_ENV !== "production") {
    console.warn("REDIS_URL memakai host docker 'redis' — di-skip untuk local. Kosongkan REDIS_URL di .env");
    return null;
  }

  return raw;
}

const url = resolveRedisUrl();

export const redis: Redis | null = url
  ? new Redis(url, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
      enableOfflineQueue: false,
    })
  : null;

if (redis) {
  redis.connect().catch((err) => {
    console.warn("Redis connect failed, falling back to memory stores:", err.message);
  });
}
