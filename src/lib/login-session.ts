import { redis } from "@/lib/redis";
import { randomBytes } from "crypto";

export type LoginSessionStatus = "pending" | "awaiting_bot" | "approved" | "rejected" | "expired";

export type TemporaryLoginSession = {
  sessionId: string;
  userId: string;
  email: string;
  fingerprintId: string;
  userAgent: string;
  ip: string;
  country?: string | null;
  city?: string | null;
  lat?: number | null;
  lon?: number | null;
  confirmCode: string;
  status: LoginSessionStatus;
  requireBot: boolean;
  ticket?: string;
  createdAt: number;
};

const TTL_SECONDS = Number(process.env.LOGIN_SESSION_TTL_SECONDS || 300);
const memory = new Map<string, { data: TemporaryLoginSession; expiresAt: number }>();

function key(sessionId: string) {
  return `temporary_login_session:${sessionId}`;
}

function codeKey(code: string) {
  return `login_confirm_code:${code.toUpperCase()}`;
}

export function createSessionId() {
  return randomBytes(16).toString("hex");
}

export function createConfirmCode() {
  return randomBytes(3).toString("hex").toUpperCase();
}

export async function saveLoginSession(session: TemporaryLoginSession): Promise<void> {
  const payload = JSON.stringify(session);
  if (redis) {
    await redis.set(key(session.sessionId), payload, "EX", TTL_SECONDS);
    await redis.set(codeKey(session.confirmCode), session.sessionId, "EX", TTL_SECONDS);
    return;
  }
  memory.set(session.sessionId, {
    data: session,
    expiresAt: Date.now() + TTL_SECONDS * 1000,
  });
}

export async function getLoginSession(sessionId: string): Promise<TemporaryLoginSession | null> {
  if (redis) {
    const raw = await redis.get(key(sessionId));
    return raw ? (JSON.parse(raw) as TemporaryLoginSession) : null;
  }
  const entry = memory.get(sessionId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memory.delete(sessionId);
    return null;
  }
  return entry.data;
}

export async function getLoginSessionByCode(code: string): Promise<TemporaryLoginSession | null> {
  if (redis) {
    const sessionId = await redis.get(codeKey(code));
    if (!sessionId) return null;
    return getLoginSession(sessionId);
  }
  for (const [, entry] of memory) {
    if (entry.expiresAt <= Date.now()) continue;
    if (entry.data.confirmCode.toUpperCase() === code.toUpperCase()) return entry.data;
  }
  return null;
}

export async function updateLoginSession(
  sessionId: string,
  patch: Partial<TemporaryLoginSession>,
): Promise<TemporaryLoginSession | null> {
  const current = await getLoginSession(sessionId);
  if (!current) return null;
  const next = { ...current, ...patch };
  await saveLoginSession(next);
  return next;
}

export async function deleteLoginSession(sessionId: string): Promise<void> {
  const current = await getLoginSession(sessionId);
  if (redis) {
    await redis.del(key(sessionId));
    if (current) await redis.del(codeKey(current.confirmCode));
    return;
  }
  memory.delete(sessionId);
}

export function loginSessionTtlSeconds() {
  return TTL_SECONDS;
}
