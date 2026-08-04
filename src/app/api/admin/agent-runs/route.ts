/**
 * Riwayat run untuk konsol Agent Studio.
 *
 * Dua sumber yang sengaja berbeda umur: event per-node hidup di Redis dan hanya
 * beberapa puluh terakhir (itu bahan animasi kanvas, bukan arsip), sedangkan
 * siklus heartbeat dibaca dari tabel karena di situlah bukti bahwa fitur
 * proaktif benar-benar berjalan.
 */

import { NextResponse } from "next/server";
import { readRecentAgentEvents } from "@/lib/agent-telemetry";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    const [events, heartbeatRuns] = await Promise.all([
      readRecentAgentEvents(),
      prisma.heartbeatRun.findMany({
        orderBy: { startedAt: "desc" },
        take: 20,
        select: {
          id: true,
          cadence: true,
          status: true,
          reason: true,
          startedAt: true,
          durationMs: true,
        },
      }),
    ]);

    return NextResponse.json({ ok: true, data: { events, heartbeatRuns } });
  } catch (error) {
    console.error("[agent-runs] gagal memuat:", error);
    return NextResponse.json({ ok: false, error: "Gagal memuat riwayat run." }, { status: 500 });
  }
}
