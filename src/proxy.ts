import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const ACCESS_COOKIE = "ledgerly_access";
const ADMIN_COOKIE = "ledgerly_admin";

type Surface = "apex" | "app" | "admin";

async function verify(token: string, expectAdmin: boolean) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    // The two cookies share a signing secret, so the scope claim is the only
    // thing separating them here. Revocation is re-checked in the layouts.
    const isAdmin = payload.scope === "ADMIN";
    if (isAdmin !== expectAdmin) return null;
    return typeof payload.uid === "string" ? payload.uid : null;
  } catch {
    return null;
  }
}

/**
 * Route groups never appear in the URL, so the host is what decides which part
 * of the app a request may reach. Anything unrecognised is treated as the apex
 * (landing), which is the surface that leaks the least.
 */
function surfaceFor(host: string): Surface {
  const sub = host.split(":")[0].split(".")[0].toLowerCase();
  if (sub === "admin") return "admin";
  if (sub === "app") return "app";
  return "apex";
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icons")
  ) {
    return NextResponse.next();
  }

  const surface = surfaceFor(request.headers.get("host") ?? "");

  // ---- admin.<domain> ------------------------------------------------------
  if (surface === "admin") {
    if (pathname.startsWith("/api/admin")) return NextResponse.next();
    // Nothing else on this host may touch the business API.
    if (pathname.startsWith("/api")) {
      return NextResponse.rewrite(new URL("/404", request.url));
    }

    const target = pathname.startsWith("/admin") ? pathname : `/admin${pathname}`;
    if (target === "/admin/login") {
      return NextResponse.rewrite(new URL(target, request.url));
    }

    const token = request.cookies.get(ADMIN_COOKIE)?.value;
    if (!token || !(await verify(token, true))) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.rewrite(new URL(target, request.url));
  }

  // The panel is only reachable through its own host — never by guessing a path.
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    return NextResponse.rewrite(new URL("/404", request.url));
  }

  if (
    pathname.startsWith("/api/setup") ||
    pathname.startsWith("/api/access") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/channels/ingress") ||
    pathname.startsWith("/api/payments")
  ) {
    return NextResponse.next();
  }

  if (
    pathname === "/" ||
    pathname === "/setup" ||
    pathname === "/access" ||
    pathname === "/denied" ||
    pathname === "/daftar" ||
    pathname === "/masuk"
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  const userId = token ? await verify(token, false) : null;
  const needsAuth = pathname.startsWith("/dashboard") || pathname.startsWith("/settings");

  if (needsAuth && !userId) {
    return NextResponse.redirect(new URL("/masuk", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
