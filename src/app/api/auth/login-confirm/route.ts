import { z } from "zod";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import {
  getLoginSession,
  getLoginSessionByCode,
  updateLoginSession,
} from "@/lib/login-session";
import { emitLoginConfirmed, emitLoginRejected } from "@/lib/socket-server";
import { trustDevice } from "@/lib/device-trust";
import { logSuspiciousLogin } from "@/lib/security-log";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  code: z.string().min(4).max(16),
  /** optional if called from authenticated dashboard — usually from bot worker */
  sessionId: z.string().optional(),
});

/**
 * Bot / worker confirms or rejects a pending login.
 * Auth: x-worker-secret OR (future) session cookie of same user.
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-worker-secret");
  const isWorker = Boolean(secret && secret === process.env.WORKER_SECRET);

  if (!isWorker) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = schema.parse(await request.json());
    const rl = rateLimit(`login-confirm:${body.code}`, 30);
    if (!rl.ok) {
      return NextResponse.json({ ok: false, error: "Rate limited" }, { status: 429 });
    }

    const session =
      (body.sessionId ? await getLoginSession(body.sessionId) : null) ||
      (await getLoginSessionByCode(body.code));

    if (!session) {
      return NextResponse.json({
        ok: true,
        data: { text: "Kode login tidak valid atau sudah kedaluwarsa." },
      });
    }

    if (session.confirmCode.toUpperCase() !== body.code.toUpperCase()) {
      return NextResponse.json({
        ok: true,
        data: { text: "Kode tidak cocok." },
      });
    }

    if (body.action === "reject") {
      await updateLoginSession(session.sessionId, { status: "rejected" });
      emitLoginRejected(session.sessionId, "Ditolak via bot");
      logSuspiciousLogin({
        type: "login_rejected_bot",
        userId: session.userId,
        email: session.email,
        ip: session.ip,
        fingerprintId: session.fingerprintId,
      });
      return NextResponse.json({
        ok: true,
        data: { text: "Login ditolak. Dashboard tidak akan masuk." },
      });
    }

    const ticket = randomBytes(24).toString("hex");
    await updateLoginSession(session.sessionId, {
      status: "approved",
      ticket,
    });

    await trustDevice({
      userId: session.userId,
      fingerprintId: session.fingerprintId,
      userAgent: session.userAgent,
      ip: session.ip,
      geo: {
        country: session.country ?? null,
        city: session.city ?? null,
        lat: session.lat ?? null,
        lon: session.lon ?? null,
      },
    });

    emitLoginConfirmed(session.sessionId, {
      ticket,
      userId: session.userId,
    });

    logSuspiciousLogin({
      type: "login_approved_bot",
      userId: session.userId,
      email: session.email,
      ip: session.ip,
      fingerprintId: session.fingerprintId,
      country: session.country,
    });

    return NextResponse.json({
      ok: true,
      data: { text: "✅ Login disetujui. Dashboard akan terbuka otomatis." },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, error: "Confirm failed" }, { status: 500 });
  }
}
