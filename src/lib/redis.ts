import Redis from "ioredis";

const url = process.env.REDIS_URL;

export const redis: Redis | null = url
  ? new Redis(url, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    })
  : null;

if (redis) {
  redis.connect().catch((err) => {
    console.warn("Redis connect failed, falling back to memory stores:", err.message);
  });
}
