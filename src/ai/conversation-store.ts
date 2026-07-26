import { redis } from "@/lib/redis";
import type { AgentMessage } from "./agent";

const MAX_TURNS = 10;
const TTL_SECONDS = 60 * 60 * 6;

const memoryStore = new Map<string, { messages: AgentMessage[]; expiresAt: number }>();

function storeKey(userId: string, channel: string): string {
  return `chat:${channel}:${userId}`;
}

function pruneMemoryStore(now: number) {
  for (const [key, entry] of memoryStore) {
    if (entry.expiresAt < now) memoryStore.delete(key);
  }
}

export async function loadHistory(userId: string, channel: string): Promise<AgentMessage[]> {
  const key = storeKey(userId, channel);

  if (redis) {
    try {
      const raw = await redis.lrange(key, -MAX_TURNS * 2, -1);
      return raw.map((entry) => JSON.parse(entry) as AgentMessage);
    } catch {
      // jatuh ke memory store di bawah
    }
  }

  const now = Date.now();
  pruneMemoryStore(now);
  const entry = memoryStore.get(key);
  if (!entry || entry.expiresAt < now) return [];
  return entry.messages;
}

export async function appendHistory(
  userId: string,
  channel: string,
  messages: AgentMessage[],
): Promise<void> {
  if (messages.length === 0) return;
  const key = storeKey(userId, channel);

  if (redis) {
    try {
      await redis
        .multi()
        .rpush(key, ...messages.map((m) => JSON.stringify(m)))
        .ltrim(key, -MAX_TURNS * 2, -1)
        .expire(key, TTL_SECONDS)
        .exec();
      return;
    } catch {
      // jatuh ke memory store di bawah
    }
  }

  const now = Date.now();
  pruneMemoryStore(now);
  const existing = memoryStore.get(key);
  const combined = [...(existing && existing.expiresAt >= now ? existing.messages : []), ...messages];
  memoryStore.set(key, {
    messages: combined.slice(-MAX_TURNS * 2),
    expiresAt: now + TTL_SECONDS * 1000,
  });
}

export async function clearHistory(userId: string, channel: string): Promise<void> {
  const key = storeKey(userId, channel);
  if (redis) {
    try {
      await redis.del(key);
      return;
    } catch {
      // jatuh ke memory store di bawah
    }
  }
  memoryStore.delete(key);
}
