import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { consumeAccessChallenge, getAccessChallenge } from "@/lib/access-challenge";
import { adminCookieOptions, issueAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/db";
import { getClientIp, lookupGeo } from "@/lib/geo";
import { logSuspiciousLogin } from "@/lib/security-log";

const schema = z.object({
  sessionId: z.string().min(8),
  fingerprintId: z.string().min(8),
});

/**
 * Trades an approved ADMIN_LOGIN challenge for the admin cookie. Purpose and
 * role are both re-checked here: the challenge proves Telegram approved, but
 * the role could have been revoked while the request was in flight.
 */
export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const challenge = await getAccessChallenge(body.sessionId);

    if (!challenge || challenge.status !== "approved") {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_APPROVED", message: "Belum diizinkan / kedaluwarsa." } },
        { status: 403 },
      );
    }
    if (challenge.purpose !== "ADMIN_LOGIN" || !challenge.userId) {
      return NextResponse.json(
        { ok: false, error: { code: "WRONG_FLOW", message: "Permintaan tidak valid." } },
        { status: 403 },
      );
    }
    if (challenge.fingerprintId !== body.fingerprintId) {
      return NextResponse.json(
        { ok: false, error: { code: "FINGERPRINT", message: "Perangkat tidak cocok." } },
        { status: 401 },
      );
    }

    const consumed = await consumeAccessChallenge(body.sessionId, body.fingerprintId);
    if (!consumed?.userId) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_APPROVED", message: "Izin sudah dipakai." } },
        { status: 403 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: consumed.userId },
      select: { id: true, role: true, status: true },
    });
    if (!user || user.role !== "ADMIN" || user.status === "SUSPENDED") {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Bukan admin." } },
        { status: 403 },
      );
    }

    const ip = getClientIp(request.headers);
    const geo = lookupGeo(ip);
    const { token } = await issueAdminSession({
      userId: user.id,
      fingerprintId: body.fingerprintId,
      userAgent: challenge.userAgent,
      ip,
      country: geo.country,
      city: geo.city,
    });

    const jar = await cookies();
    jar.set(adminCookieOptions(token));

    logSuspiciousLogin({
      type: "admin_login_success",
      ip,
      fingerprintId: body.fingerprintId,
      country: geo.country,
    });

    return NextResponse.json({ ok: true, data: { redirectTo: "/" } });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "Gagal membuka sesi admin." } },
      { status: 500 },
    );
  }
}
