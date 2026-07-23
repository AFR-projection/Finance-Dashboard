import { NextResponse } from "next/server";
import { getLoginSession } from "@/lib/login-session";

/** Polling fallback if Socket.io disconnected */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "sessionId required" }, { status: 400 });
  }
  const session = await getLoginSession(sessionId);
  if (!session) {
    return NextResponse.json({ ok: true, data: { status: "expired" } });
  }
  return NextResponse.json({
    ok: true,
    data: {
      status: session.status,
      ticket: session.status === "approved" ? session.ticket : undefined,
      requireBot: session.requireBot,
    },
  });
}
