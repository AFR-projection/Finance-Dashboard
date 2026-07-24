import { randomBytes } from "crypto";
import { redis } from "@/lib/redis";

export type AccessChallenge = {
  sessionId: string;
  confirmCode: string;
  fingerprintId: string;
  userAgent: string;
  ip: string;
  country?: string | null;
  city?: string | null;
  status: "pending" | "approved" | "rejected" | "expired";
  createdAt: number;
};

const TTL = Number(process.env.LOGIN_SESSION_TTL_SECONDS || 300);
const memory = new Map<string, { data: AccessChallenge; exp: number }>();

function key(id: string) {
  return `access_challenge:${id}`;
}
function codeKey(code: string) {
  return `access_code:${code.toUpperCase()}`;
}

export function newAccessIds() {
  return {
    sessionId: randomBytes(16).toString("hex"),
    confirmCode: randomBytes(3).toString("hex").toUpperCase(),
  };
}

export async function saveAccessChallenge(c: AccessChallenge) {
  const raw = JSON.stringify(c);
  if (redis) {
    await redis.set(key(c.sessionId), raw, "EX", TTL);
    await redis.set(codeKey(c.confirmCode), c.sessionId, "EX", TTL);
    return;
  }
  memory.set(c.sessionId, { data: c, exp: Date.now() + TTL * 1000 });
}

export async function getAccessChallenge(sessionId: string) {
  if (redis) {
    const raw = await redis.get(key(sessionId));
    return raw ? (JSON.parse(raw) as AccessChallenge) : null;
  }
  const e = memory.get(sessionId);
  if (!e || e.exp < Date.now()) {
    memory.delete(sessionId);
    return null;
  }
  return e.data;
}

export async function getAccessChallengeByCode(code: string) {
  if (redis) {
    const id = await redis.get(codeKey(code));
    return id ? getAccessChallenge(id) : null;
  }
  for (const [, e] of memory) {
    if (e.exp < Date.now()) continue;
    if (e.data.confirmCode.toUpperCase() === code.toUpperCase()) return e.data;
  }
  return null;
}

export async function updateAccessChallenge(
  sessionId: string,
  patch: Partial<AccessChallenge>,
) {
  const cur = await getAccessChallenge(sessionId);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  await saveAccessChallenge(next);
  return next;
}

export function accessTtlSeconds() {
  return TTL;
}
