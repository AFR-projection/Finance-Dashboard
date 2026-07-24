import { NextResponse } from "next/server";

/** Lightweight probe for Docker / deploy.sh — no auth, no DB. */
export async function GET() {
  return NextResponse.json({ ok: true, service: "ledgerly" });
}
