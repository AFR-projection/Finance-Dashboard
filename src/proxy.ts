import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const ACCESS_COOKIE = "ledgerly_access";

async function verify(token: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return typeof payload.uid === "string" ? payload.uid : null;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api/setup") ||
    pathname.startsWith("/api/access") ||
    pathname.startsWith("/api/channels/ingress") ||
    pathname.startsWith("/api/channels/whatsapp-session") ||
    pathname.startsWith("/api/auth/login-confirm") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  if (pathname === "/setup" || pathname === "/access" || pathname === "/denied") {
    return NextResponse.next();
  }

  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  const userId = token ? await verify(token) : null;
  const needsAuth =
    pathname.startsWith("/dashboard") || pathname.startsWith("/settings") || pathname === "/";

  if (needsAuth && !userId && pathname !== "/") {
    return NextResponse.redirect(new URL("/access", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
