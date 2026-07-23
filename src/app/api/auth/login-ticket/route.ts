import { z } from "zod";
import { getLoginSession, updateLoginSession } from "@/lib/login-session";
import { getClientIp, lookupGeo, isDrasticGeoChange } from "@/lib/geo";
import { emitLoginNeedsRevalidation } from "@/lib/socket-server";
import { logSuspiciousLogin } from "@/lib/security-log";
import { trustDevice } from "@/lib/device-trust";

const schema = z.object({
  sessionId: z.string().min(8),
  ticket: z.string().min(16),
  fingerprintId: z.string().min(8).max(128),
});

/**
 * Exchange approved login ticket for Auth.js credentials sign-in payload.
 * Also re-checks IP drift mid-login → force bot re-validation.
 */
export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const session = await getLoginSession(body.sessionId);

    if (!session || session.status !== "approved" || session.ticket !== body.ticket) {
      return Response.json(
        { ok: false, error: { code: "INVALID_TICKET", message: "Ticket tidak valid." } },
        { status: 401 },
      );
    }

    if (session.fingerprintId !== body.fingerprintId) {
      logSuspiciousLogin({
        type: "login_fingerprint_mismatch",
        userId: session.userId,
        email: session.email,
        fingerprintId: body.fingerprintId,
      });
      return Response.json(
        { ok: false, error: { code: "FINGERPRINT", message: "Perangkat tidak cocok." } },
        { status: 401 },
      );
    }

    const ip = getClientIp(request.headers);
    const geo = lookupGeo(ip);
    const drastic = isDrasticGeoChange(
      {
        country: session.country ?? null,
        city: session.city ?? null,
        lat: session.lat ?? null,
        lon: session.lon ?? null,
        ip: session.ip,
      },
      { ...geo, ip },
    );

    if (drastic) {
      await updateLoginSession(session.sessionId, {
        status: "awaiting_bot",
        ticket: undefined,
        ip,
        country: geo.country,
        city: geo.city,
        lat: geo.lat,
        lon: geo.lon,
        requireBot: true,
      });
      emitLoginNeedsRevalidation(
        session.sessionId,
        "IP berubah drastis saat login — konfirmasi ulang via bot.",
      );
      logSuspiciousLogin({
        type: "login_ip_drift",
        userId: session.userId,
        email: session.email,
        ip,
        country: geo.country,
        reason: `from ${session.ip} to ${ip}`,
      });
      return Response.json(
        {
          ok: false,
          error: {
            code: "REVALIDATE",
            message: "IP berubah drastis. Konfirmasi ulang via bot.",
            confirmCode: session.confirmCode,
          },
        },
        { status: 403 },
      );
    }

    await trustDevice({
      userId: session.userId,
      fingerprintId: session.fingerprintId,
      userAgent: session.userAgent,
      ip,
      geo,
    });

    return Response.json({
      ok: true,
      data: {
        email: session.email,
        ticket: body.ticket,
        userId: session.userId,
      },
    });
  } catch (error) {
    console.error(error);
    return Response.json(
      { ok: false, error: { code: "INTERNAL", message: "Ticket exchange failed" } },
      { status: 500 },
    );
  }
}
