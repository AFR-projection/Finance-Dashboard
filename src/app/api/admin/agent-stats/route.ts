/**
 * Angka rail metrik, dipisah dari `/agent-runs` karena umurnya berbeda.
 *
 * Event run berubah tiap kali ada yang mengirim pesan; agregat 24 jam nyaris
 * tidak bergerak di antara dua panggilan. Menggabungkannya berarti setiap
 * penyegaran konsol ikut menjalankan lima query agregat ke Neon.
 */

import { NextResponse } from "next/server";
import { readAgentStats } from "@/lib/agent-stats";
import { getAdminSession } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  // `readAgentStats` sudah menelan kegagalannya sendiri dan mengembalikan angka
  // nol, jadi rail menampilkan "belum ada data" alih-alih pesan error merah.
  return NextResponse.json({ ok: true, data: await readAgentStats() });
}
