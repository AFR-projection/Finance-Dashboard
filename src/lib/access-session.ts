import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const ACCESS_COOKIE = "ledgerly_access";
const TTL_HOURS = 12;

function secretKey() {
  const raw = process.env.AUTH_SECRET;
  if (!raw || raw.length < 16) {
    throw new Error("AUTH_SECRET must be set");
  }
  return new TextEncoder().encode(raw);
}

export async function issueAccessSession(input: {
  userId: string;
  fingerprintId: string;
  userAgent?: string | null;
  ip?: string | null;
  country?: string | null;
  city?: string | null;
}) {
  const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);
  const session = await prisma.accessSession.create({
    data: {
      userId: input.userId,
      fingerprintId: input.fingerprintId,
      userAgent: input.userAgent ?? null,
      ip: input.ip ?? null,
      country: input.country ?? null,
      city: input.city ?? null,
      expiresAt,
    },
  });

  const token = await new SignJWT({ uid: input.userId, fp: input.fingerprintId })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(session.id)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secretKey());

  return { token, sessionId: session.id, expiresAt };
}

/** Signature-only check. Cheap enough for proxy.ts, but says nothing about revocation. */
export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, secretKey());
  const userId = typeof payload.uid === "string" ? payload.uid : null;
  const sessionId = typeof payload.jti === "string" ? payload.jti : null;
  if (!userId || !sessionId) return null;
  return {
    userId,
    sessionId,
    fingerprintId: typeof payload.fp === "string" ? payload.fp : null,
  };
}

/** Full check: valid signature AND a live, unrevoked row in the database. */
export async function getAccessSession() {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (!token) return null;

  let claims: Awaited<ReturnType<typeof verifyAccessToken>>;
  try {
    claims = await verifyAccessToken(token);
  } catch {
    return null;
  }
  if (!claims) return null;

  const row = await prisma.accessSession.findUnique({ where: { id: claims.sessionId } });
  if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) return null;
  if (row.userId !== claims.userId) return null;
  // An ADMIN-scoped session is signed with the same secret, so without this the
  // admin cookie would also unlock the dashboard. Scopes stay one-way.
  if (row.scope !== "USER") return null;

  return {
    userId: row.userId,
    sessionId: row.id,
    fingerprintId: row.fingerprintId,
  };
}

export async function touchAccessSession(sessionId: string) {
  await prisma.accessSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { lastSeenAt: new Date() },
  });
}

export async function revokeAccessSession(sessionId: string) {
  await prisma.accessSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllAccessSessions(userId: string) {
  await prisma.accessSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function listAccessSessions(userId: string) {
  return prisma.accessSession.findMany({
    where: { userId, scope: "USER", revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
  });
}

export function accessCookieOptions(token: string) {
  return {
    name: ACCESS_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_HOURS * 60 * 60,
  };
}
