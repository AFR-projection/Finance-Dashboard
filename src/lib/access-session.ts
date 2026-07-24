import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const ACCESS_COOKIE = "ledgerly_access";
const TTL = "12h";

function secretKey() {
  const raw = process.env.AUTH_SECRET;
  if (!raw || raw.length < 16) {
    throw new Error("AUTH_SECRET must be set");
  }
  return new TextEncoder().encode(raw);
}

export async function signAccessToken(payload: {
  userId: string;
  fingerprintId?: string;
}) {
  return new SignJWT({
    uid: payload.userId,
    fp: payload.fingerprintId ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(secretKey());
}

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, secretKey());
  const userId = typeof payload.uid === "string" ? payload.uid : null;
  if (!userId) return null;
  return {
    userId,
    fingerprintId: typeof payload.fp === "string" ? payload.fp : null,
  };
}

export async function getAccessSession() {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    return await verifyAccessToken(token);
  } catch {
    return null;
  }
}

export function accessCookieOptions(token: string) {
  return {
    name: ACCESS_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  };
}
