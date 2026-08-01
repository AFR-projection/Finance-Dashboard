import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearAdminCookieOptions, getAdminSession, revokeAdminSession } from "@/lib/admin-session";

/** Posted from a plain <form>, so the answer must be a redirect, not JSON. */
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (session) await revokeAdminSession(session.sessionId);

  const jar = await cookies();
  jar.set(clearAdminCookieOptions());
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
