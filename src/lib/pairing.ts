import { randomBytes } from "crypto";
import { redis } from "@/lib/redis";

type PairEntry = { userId: string; expiresAt: number };

const memoryStore = new Map<string, PairEntry>();
const TTL_MS = 10 * 60 * 1000;

function cleanupMemory() {
  const now = Date.now();
  for (const [code, entry] of memoryStore) {
    if (entry.expiresAt <= now) memoryStore.delete(code);
  }
}

export async function createPairingCode(userId: string): Promise<string> {
  const code = randomBytes(3).toString("hex").toUpperCase();
  const expiresAt = Date.now() + TTL_MS;

  if (redis) {
    await redis.set(`pair:${code}`, userId, "PX", TTL_MS);
  } else {
    cleanupMemory();
    memoryStore.set(code, { userId, expiresAt });
  }
  return code;
}

export async function consumePairingCode(code: string): Promise<string | null> {
  const normalized = code.trim().toUpperCase();
  if (redis) {
    const userId = await redis.get(`pair:${normalized}`);
    if (!userId) return null;
    await redis.del(`pair:${normalized}`);
    return userId;
  }
  cleanupMemory();
  const entry = memoryStore.get(normalized);
  if (!entry || entry.expiresAt <= Date.now()) {
    memoryStore.delete(normalized);
    return null;
  }
  memoryStore.delete(normalized);
  return entry.userId;
}
