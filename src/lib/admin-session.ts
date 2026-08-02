import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import {
  ADMIN_COOKIE,
  ADMIN_TTL_HOURS,
  signAdminToken,
  verifyAdminToken,
} from "@/lib/admin-token";

// Re-exported so every caller keeps its existing import site; the definitions
// live in `admin-token.ts` because the custom server cannot load `next/headers`.
export {
  ADMIN_COOKIE,
  adminCookieOptions,
  clearAdminCookieOptions,
  verifyAdminToken,
} from "@/lib/admin-token";

export async function issueAdminSession(input: {
  userId: string;
  fingerprintId: string;
  userAgent?: string | null;
  ip?: string | null;
  country?: string | null;
  city?: string | null;
}) {
  const expiresAt = new Date(Date.now() + ADMIN_TTL_HOURS * 60 * 60 * 1000);
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

  const token = await signAdminToken({
    userId: input.userId,
    sessionId: session.id,
    expiresAt,
  });

  return { token, sessionId: session.id, expiresAt };
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
