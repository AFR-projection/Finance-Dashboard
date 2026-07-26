import { z } from "zod";
import { NextResponse } from "next/server";
import {
  getAccessChallengeByCode,
  updateAccessChallenge,
} from "@/lib/access-challenge";
import { getSocketServer } from "@/lib/socket-server";
import { logSuspiciousLogin } from "@/lib/security-log";
import { rateLimit } from "@/lib/rate-limit";
import { requireOwnerUserId } from "@/lib/app-config";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  code: z.string().min(4).max(16),
});

/** Called by WhatsApp/Telegram workers with worker secret */
export async function POST(request: Request) {
  const secret = request.headers.get("x-worker-secret");
  if (!secret || secret !== process.env.WHATSAPP_WORKER_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = schema.parse(await request.json());
    const rl = rateLimit(`access-confirm:${body.code}`, 40);
    if (!rl.ok) {
      return NextResponse.json({ ok: false, error: "Rate limited" }, { status: 429 });
    }

    const challenge = await getAccessChallengeByCode(body.code);
    if (!challenge) {
      return NextResponse.json({
        ok: true,
        data: { text: "Kode akses tidak valid / kedaluwarsa." },
      });
    }

    if (body.action === "reject") {
      await updateAccessChallenge(challenge.sessionId, { status: "rejected" });
      getSocketServer()?.to(`login:${challenge.sessionId}`).emit("access:rejected", {
        reason: "Akses ditolak oleh owner.",
      });
      logSuspiciousLogin({
        type: "access_rejected",
        ip: challenge.ip,
        fingerprintId: challenge.fingerprintId,
      });
      return NextResponse.json({
        ok: true,
        data: { text: "Akses ditolak. Pengunjung tidak bisa masuk dashboard." },
      });
    }

    await requireOwnerUserId();
    await updateAccessChallenge(challenge.sessionId, { status: "approved" });
    getSocketServer()?.to(`login:${challenge.sessionId}`).emit("access:approved", {
      sessionId: challenge.sessionId,
    });
    logSuspiciousLogin({
      type: "access_approved",
      ip: challenge.ip,
      fingerprintId: challenge.fingerprintId,
      country: challenge.country,
    });

    return NextResponse.json({
      ok: true,
      data: { text: "✅ Akses diizinkan. Dashboard akan terbuka otomatis." },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, error: "Confirm failed" }, { status: 500 });
  }
}
