import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const ADMIN_COOKIE = "ledgerly_admin";
/** Deliberately shorter than the 12h user session: this cookie opens every account. */
const TTL_HOURS = 4;

function secretKey() {
  const raw = process.env.AUTH_SECRET;
  if (!raw || raw.length < 16) throw new Error("AUTH_SECRET must be set");
  return new TextEncoder().encode(raw);
}

export async function issueAdminSession(input: {
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
      scope: "ADMIN",
      userAgent: input.userAgent ?? null,
      ip: input.ip ?? null,
      country: input.country ?? null,
      city: input.city ?? null,
      expiresAt,
    },
  });

  const token = await new SignJWT({ uid: input.userId, scope: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(session.id)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secretKey());

  return { token, sessionId: session.id, expiresAt };
}

/** Signature-only check, safe for proxy.ts. Says nothing about revocation. */
export async function verifyAdminToken(token: string) {
  const { payload } = await jwtVerify(token, secretKey());
  if (payload.scope !== "ADMIN") return null;
  const userId = typeof payload.uid === "string" ? payload.uid : null;
  const sessionId = typeof payload.jti === "string" ? payload.jti : null;
  if (!userId || !sessionId) return null;
  return { userId, sessionId };
}

/**
 * Full check for server components and admin route handlers.
 *
 * Three independent gates, because any one of them failing alone would be an
 * escalation: the row must be an ADMIN-scoped session, it must be live, and the
 * user must still hold the ADMIN role (demotion revokes access immediately).
 */
export async function getAdminSession() {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (!token) return null;

  let claims: Awaited<ReturnType<typeof verifyAdminToken>>;
  try {
    claims = await verifyAdminToken(token);
  } catch {
    return null;
  }
  if (!claims) return null;

  const row = await prisma.accessSession.findUnique({ where: { id: claims.sessionId } });
  if (!row || row.scope !== "ADMIN") return null;
  if (row.revokedAt || row.expiresAt.getTime() <= Date.now()) return null;
  if (row.userId !== claims.userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: row.userId },
    select: { id: true, name: true, username: true, role: true, status: true },
  });
  if (!user || user.role !== "ADMIN" || user.status === "SUSPENDED") return null;

  return { userId: user.id, sessionId: row.id, name: user.name, username: user.username };
}

export async function revokeAdminSession(sessionId: string) {
  await prisma.accessSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Host-only cookie: no `Domain` attribute, so the browser sends it back to
 * admin.<domain> and nowhere else. This is what keeps a stolen admin cookie
 * from being replayed against the user dashboard, and vice versa.
 */
export function adminCookieOptions(token: string) {
  return {
    name: ADMIN_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_HOURS * 60 * 60,
  };
}

export function clearAdminCookieOptions() {
  return { ...adminCookieOptions(""), maxAge: 0 };
}
