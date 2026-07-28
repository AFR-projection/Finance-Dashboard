import { z } from "zod";
import { cookies } from "next/headers";
import {
  getAccessChallenge,
  consumeAccessChallenge,
  reopenAccessChallenge,
} from "@/lib/access-challenge";
import { accessCookieOptions, issueAccessSession } from "@/lib/access-session";
import { requireOwnerUserId } from "@/lib/app-config";
import { getClientIp, isDrasticGeoChange, lookupGeo } from "@/lib/geo";
import { trustDevice } from "@/lib/device-trust";
import { logSuspiciousLogin } from "@/lib/security-log";

const schema = z.object({
  sessionId: z.string().min(8),
  fingerprintId: z.string().min(8),
});

/** After bot approve → set httpOnly access cookie */
export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const challenge = await getAccessChallenge(body.sessionId);
    if (!challenge || challenge.status !== "approved") {
      return Response.json(
        { ok: false, error: { code: "NOT_APPROVED", message: "Belum diizinkan / kedaluwarsa." } },
        { status: 403 },
      );
    }
    if (challenge.fingerprintId !== body.fingerprintId) {
      return Response.json(
        { ok: false, error: { code: "FINGERPRINT", message: "Perangkat tidak cocok." } },
        { status: 401 },
      );
    }

    const ip = getClientIp(request.headers);
    const geo = lookupGeo(ip);
    if (
      isDrasticGeoChange(
        {
          country: challenge.country ?? null,
          city: challenge.city ?? null,
          lat: null,
          lon: null,
          ip: challenge.ip,
        },
        { ...geo, ip },
      )
    ) {
      await reopenAccessChallenge(body.sessionId);
      logSuspiciousLogin({
        type: "access_ip_drift",
        ip,
        fingerprintId: body.fingerprintId,
        reason: `${challenge.ip} → ${ip}`,
      });
      return Response.json(
        {
          ok: false,
          error: {
            code: "REVALIDATE",
            message: "IP berubah drastis. Minta izin ulang ke bot.",
          },
        },
        { status: 403 },
      );
    }

    // Atomic: an approval can be traded for exactly one session cookie.
    const consumed = await consumeAccessChallenge(body.sessionId, body.fingerprintId);
    if (!consumed) {
      return Response.json(
        { ok: false, error: { code: "NOT_APPROVED", message: "Izin sudah dipakai / kedaluwarsa." } },
        { status: 403 },
      );
    }

    const userId = await requireOwnerUserId();
    await trustDevice({
      userId,
      fingerprintId: body.fingerprintId,
      userAgent: challenge.userAgent,
      ip,
      geo,
    });

    const { token } = await issueAccessSession({
      userId,
      fingerprintId: body.fingerprintId,
      userAgent: challenge.userAgent,
      ip,
      country: geo.country,
      city: geo.city,
    });
    const jar = await cookies();
    jar.set(accessCookieOptions(token));

    return Response.json({ ok: true, data: { redirectTo: "/dashboard" } });
  } catch (error) {
    console.error(error);
    return Response.json(
      { ok: false, error: { code: "INTERNAL", message: "Gagal membuka sesi" } },
      { status: 500 },
    );
  }
}
