import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { AccessChallengeStatus, ChallengePurpose } from "@prisma/client";
import { prisma } from "@/lib/db";

export type AccessChallenge = {
  sessionId: string;
  fingerprintId: string;
  userAgent: string;
  ip: string;
  country?: string | null;
  city?: string | null;
  status: "pending" | "approved" | "rejected" | "expired";
  purpose: ChallengePurpose;
  userId: string | null;
  username: string | null;
  attempts: number;
  createdAt: number;
};

const TTL = Number(process.env.LOGIN_SESSION_TTL_SECONDS || 300);

/** A wrong guess is cheap for an attacker but a lockout is cheap for us. */
const MAX_ATTEMPTS = 8;

const STATUS_OUT: Record<AccessChallengeStatus, AccessChallenge["status"]> = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  CONSUMED: "approved",
};

function hashCode(code: string) {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

type Row = {
  sessionId: string;
  fingerprintId: string;
  userAgent: string | null;
  ip: string | null;
  country: string | null;
  city: string | null;
  status: AccessChallengeStatus;
  purpose: ChallengePurpose;
  userId: string | null;
  username: string | null;
  attempts: number;
  createdAt: Date;
};

function toChallenge(row: Row): AccessChallenge {
  return {
    sessionId: row.sessionId,
    fingerprintId: row.fingerprintId,
    userAgent: row.userAgent ?? "unknown",
    ip: row.ip ?? "",
    country: row.country,
    city: row.city,
    status: STATUS_OUT[row.status],
    purpose: row.purpose,
    userId: row.userId,
    username: row.username,
    attempts: row.attempts,
    createdAt: row.createdAt.getTime(),
  };
}

export function newAccessIds() {
  return {
    sessionId: randomBytes(16).toString("hex"),
    confirmCode: randomBytes(3).toString("hex").toUpperCase(),
  };
}

export async function createAccessChallenge(input: {
  sessionId: string;
  confirmCode: string;
  fingerprintId: string;
  userAgent: string;
  ip: string;
  country?: string | null;
  city?: string | null;
  purpose?: ChallengePurpose;
  userId?: string | null;
  username?: string | null;
}) {
  // One live challenge per device keeps an attacker from farming valid codes.
  await prisma.accessChallenge.deleteMany({
    where: { fingerprintId: input.fingerprintId, status: AccessChallengeStatus.PENDING },
  });

  await prisma.accessChallenge.create({
    data: {
      sessionId: input.sessionId,
      codeHash: hashCode(input.confirmCode),
      fingerprintId: input.fingerprintId,
      userAgent: input.userAgent,
      ip: input.ip,
      country: input.country ?? null,
      city: input.city ?? null,
      purpose: input.purpose ?? ChallengePurpose.ACCESS,
      userId: input.userId ?? null,
      username: input.username ?? null,
      expiresAt: new Date(Date.now() + TTL * 1000),
    },
  });
}

export async function getAccessChallenge(sessionId: string): Promise<AccessChallenge | null> {
  const row = await prisma.accessChallenge.findUnique({ where: { sessionId } });
  if (!row || row.expiresAt.getTime() <= Date.now()) return null;
  return toChallenge(row);
}

/**
 * Compares against every live challenge rather than indexing by code, so a
 * wrong code costs the same time as a right one.
 */
export async function getAccessChallengeByCode(code: string): Promise<AccessChallenge | null> {
  const target = Buffer.from(hashCode(code), "hex");
  const rows = await prisma.accessChallenge.findMany({
    where: {
      expiresAt: { gt: new Date() },
      status: { in: [AccessChallengeStatus.PENDING, AccessChallengeStatus.APPROVED] },
    },
  });

  let matched: Row | null = null;
  for (const row of rows) {
    const candidate = Buffer.from(row.codeHash, "hex");
    if (candidate.length === target.length && timingSafeEqual(candidate, target)) {
      matched = row;
    }
  }

  if (!matched) {
    await prisma.accessChallenge.updateMany({
      where: { status: AccessChallengeStatus.PENDING, expiresAt: { gt: new Date() } },
      data: { attempts: { increment: 1 } },
    });
    await prisma.accessChallenge.deleteMany({ where: { attempts: { gte: MAX_ATTEMPTS } } });
    return null;
  }

  if (matched.attempts >= MAX_ATTEMPTS) return null;
  return toChallenge(matched);
}

export async function approveAccessChallenge(sessionId: string) {
  const updated = await prisma.accessChallenge.updateMany({
    where: {
      sessionId,
      status: AccessChallengeStatus.PENDING,
      expiresAt: { gt: new Date() },
    },
    data: { status: AccessChallengeStatus.APPROVED, approvedAt: new Date() },
  });
  return updated.count > 0;
}

/**
 * Binds a freshly created account to its REGISTER challenge and approves it in
 * one statement, so a second submission cannot mint a second session.
 */
export async function attachUserAndApprove(sessionId: string, userId: string) {
  const updated = await prisma.accessChallenge.updateMany({
    where: {
      sessionId,
      status: AccessChallengeStatus.PENDING,
      expiresAt: { gt: new Date() },
    },
    data: { status: AccessChallengeStatus.APPROVED, approvedAt: new Date(), userId },
  });
  return updated.count > 0;
}

export async function rejectAccessChallenge(sessionId: string) {
  await prisma.accessChallenge.updateMany({
    where: { sessionId, status: AccessChallengeStatus.PENDING },
    data: { status: AccessChallengeStatus.REJECTED },
  });
}

/**
 * Approved → consumed in one statement, so two racing tabs cannot both trade
 * the same approval for a session cookie.
 */
export async function consumeAccessChallenge(sessionId: string, fingerprintId: string) {
  const consumed = await prisma.accessChallenge.updateMany({
    where: {
      sessionId,
      fingerprintId,
      status: AccessChallengeStatus.APPROVED,
      expiresAt: { gt: new Date() },
    },
    data: { status: AccessChallengeStatus.CONSUMED, consumedAt: new Date() },
  });
  if (consumed.count === 0) return null;
  const row = await prisma.accessChallenge.findUnique({ where: { sessionId } });
  return row ? toChallenge(row) : null;
}

/** Sends the device back to the waiting screen after a suspicious geo change. */
export async function reopenAccessChallenge(sessionId: string) {
  await prisma.accessChallenge.updateMany({
    where: { sessionId },
    data: { status: AccessChallengeStatus.PENDING, approvedAt: null },
  });
}

export async function purgeExpiredAccessChallenges() {
  await prisma.accessChallenge.deleteMany({ where: { expiresAt: { lte: new Date() } } });
}

export function accessTtlSeconds() {
  return TTL;
}
