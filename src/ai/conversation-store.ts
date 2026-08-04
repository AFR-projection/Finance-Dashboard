import { redis } from "@/lib/redis";
import type { AgentMessage } from "./agent";

/**
 * Batas ini sekarang datang dari node "Riwayat Percakapan" di Agent Studio.
 *
 * Nilai di sini tetap dipertahankan sebagai default supaya pemanggil yang tidak
 * meneruskan limit — dan instalasi yang belum pernah mem-publish graph —
 * berperilaku persis seperti sebelumnya.
 */
export type ConversationLimits = { maxTurns: number; ttlHours: number };

export const DEFAULT_CONVERSATION_LIMITS: ConversationLimits = { maxTurns: 10, ttlHours: 6 };

const memoryStore = new Map<string, { messages: AgentMessage[]; expiresAt: number }>();

function storeKey(userId: string, channel: string): string {
  return `chat:${channel}:${userId}`;
}

function pruneMemoryStore(now: number) {
  for (const [key, entry] of memoryStore) {
    if (entry.expiresAt < now) memoryStore.delete(key);
  }
}

export async function loadHistory(
  userId: string,
  channel: string,
  limits: ConversationLimits = DEFAULT_CONVERSATION_LIMITS,
): Promise<AgentMessage[]> {
  // maxTurns 0 berarti node riwayat dimatikan: agent tidak mengingat apa pun.
  if (limits.maxTurns <= 0) return [];
  const key = storeKey(userId, channel);

  if (redis) {
    try {
      const raw = await redis.lrange(key, -limits.maxTurns * 2, -1);
      return raw.map((entry) => JSON.parse(entry) as AgentMessage);
    } catch {
      // jatuh ke memory store di bawah
    }
  }

  const now = Date.now();
  pruneMemoryStore(now);
  const entry = memoryStore.get(key);
  if (!entry || entry.expiresAt < now) return [];
  return entry.messages.slice(-limits.maxTurns * 2);
}

export async function appendHistory(
  userId: string,
  channel: string,
  messages: AgentMessage[],
  limits: ConversationLimits = DEFAULT_CONVERSATION_LIMITS,
): Promise<void> {
  if (messages.length === 0 || limits.maxTurns <= 0) return;
  const key = storeKey(userId, channel);
  const ttlSeconds = Math.max(1, Math.round(limits.ttlHours * 3600));

  if (redis) {
    try {
      await redis
        .multi()
        .rpush(key, ...messages.map((m) => JSON.stringify(m)))
        .ltrim(key, -limits.maxTurns * 2, -1)
        .expire(key, ttlSeconds)
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
    messages: combined.slice(-limits.maxTurns * 2),
    expiresAt: now + ttlSeconds * 1000,
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
