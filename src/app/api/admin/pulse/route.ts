import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { readAdminPulse, readRecentEvents } from "@/lib/admin-metrics";

export const dynamic = "force-dynamic";

/** HTTP mirror of the socket pulse: first paint, and the fallback when sockets die. */
export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const withEvents = new URL(request.url).searchParams.get("events") === "1";

  try {
    const [pulse, events] = await Promise.all([
      readAdminPulse(),
      withEvents ? readRecentEvents(25) : Promise.resolve([]),
    ]);
    return NextResponse.json({ ok: true, data: { pulse, events } });
  } catch (error) {
    console.error("[admin/pulse]", error);
    return NextResponse.json({ ok: false, error: "Gagal membaca metrik." }, { status: 500 });
  }
}
