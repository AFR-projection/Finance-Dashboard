import { SignJWT, jwtVerify } from "jose";

/**
 * The admin cookie and its signature, with no Next.js imports.
 *
 * Kept apart from `admin-session.ts` on purpose: that module reaches for
 * `next/headers`, which throws the moment it is loaded outside a Next request
 * runtime. The custom server in `server.ts` authenticates socket handshakes and
 * runs under plain Node, so it needs these pieces without dragging the request
 * context along.
 */

export const ADMIN_COOKIE = "ledgerly_admin";
/** Deliberately shorter than the 12h user session: this cookie opens every account. */
export const ADMIN_TTL_HOURS = 4;

function secretKey() {
  const raw = process.env.AUTH_SECRET;
  if (!raw || raw.length < 16) throw new Error("AUTH_SECRET must be set");
  return new TextEncoder().encode(raw);
}

export async function signAdminToken(input: {
  userId: string;
  sessionId: string;
  expiresAt: Date;
}) {
  return new SignJWT({ uid: input.userId, scope: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(input.sessionId)
    .setIssuedAt()
    .setExpirationTime(input.expiresAt)
    .sign(secretKey());
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
    maxAge: ADMIN_TTL_HOURS * 60 * 60,
  };
}

export function clearAdminCookieOptions() {
  return { ...adminCookieOptions(""), maxAge: 0 };
}

/** Reads one cookie out of a raw `Cookie:` header. */
export function readCookieHeader(header: string | undefined, name: string) {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}
