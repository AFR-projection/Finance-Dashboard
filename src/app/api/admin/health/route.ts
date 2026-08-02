import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { readHealth } from "@/lib/admin-health";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ ok: true, data: await readHealth() });
}
