import { NextResponse } from "next/server";
import { getAccessChallenge } from "@/lib/access-challenge";

/**
 * Polling fallback for the admin login page.
 *
 * It exists instead of reusing `/api/access` because the admin host only
 * exposes `/api/admin/*` — every other API path is rewritten to 404 there, so
 * the shared status endpoint is unreachable from this page by design.
 */
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "sessionId required" }, { status: 400 });
  }

  const challenge = await getAccessChallenge(sessionId);
  // Nothing here identifies the admin; the session id is the only secret, and
  // it is useless without also holding the approved Telegram chat.
  if (!challenge || challenge.purpose !== "ADMIN_LOGIN") {
    return NextResponse.json({ ok: true, data: { status: "expired" } });
  }

  return NextResponse.json({ ok: true, data: { status: challenge.status } });
}
