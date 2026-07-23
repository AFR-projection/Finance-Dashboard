import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getClientIp, lookupGeo } from "@/lib/geo";
import { evaluateLoginRisk } from "@/lib/device-trust";
import {
  createConfirmCode,
  createSessionId,
  loginSessionTtlSeconds,
  saveLoginSession,
} from "@/lib/login-session";
import { logSuspiciousLogin } from "@/lib/security-log";
import { jsonOk } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { notifyLinkedChannels } from "@/lib/notify-channels";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fingerprintId: z.string().min(8).max(128),
});

/**
 * Step 1 of secure login:
 * Validate credentials → create Redis temporary_login_session →
 * optionally require bot confirmation (new device / drastic IP).
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request.headers);
    const rl = rateLimit(`login-challenge:${ip}`, 20);
    if (!rl.ok) {
      return Response.json(
        { ok: false, error: { code: "RATE_LIMITED", message: "Too many attempts" } },
        { status: 429 },
      );
    }

    const body = bodySchema.parse(await request.json());
    const email = body.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      logSuspiciousLogin({ type: "login_failed", email, ip, reason: "user_not_found" });
      return Response.json(
        { ok: false, error: { code: "INVALID", message: "Email atau password salah." } },
        { status: 401 },
      );
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      logSuspiciousLogin({
        type: "login_failed",
        userId: user.id,
        email,
        ip,
        reason: "bad_password",
      });
      return Response.json(
        { ok: false, error: { code: "INVALID", message: "Email atau password salah." } },
        { status: 401 },
      );
    }

    const userAgent = request.headers.get("user-agent") || "unknown";
    const geo = lookupGeo(ip);
    const risk = await evaluateLoginRisk({
      userId: user.id,
      fingerprintId: body.fingerprintId,
      userAgent,
      ip,
      geo,
    });

    const sessionId = createSessionId();
    const confirmCode = createConfirmCode();
    const ticket = randomBytes(24).toString("hex");

    await saveLoginSession({
      sessionId,
      userId: user.id,
      email: user.email,
      fingerprintId: body.fingerprintId,
      userAgent,
      ip,
      country: geo.country,
      city: geo.city,
      lat: geo.lat,
      lon: geo.lon,
      confirmCode,
      status: risk.requireBot ? "awaiting_bot" : "approved",
      requireBot: risk.requireBot,
      ticket: risk.requireBot ? undefined : ticket,
      createdAt: Date.now(),
    });

    if (risk.requireBot) {
      logSuspiciousLogin({
        type: "login_bot_required",
        userId: user.id,
        email,
        ip,
        fingerprintId: body.fingerprintId,
        country: geo.country,
        reason: risk.reason || "bot_required",
      });

      const message =
        `🔐 Login Ledgerly menunggu konfirmasi.\n` +
        `Kode: ${confirmCode}\n` +
        `IP: ${ip}${geo.country ? ` (${geo.city || geo.country})` : ""}\n` +
        `Balas: /approve ${confirmCode}  atau  /reject ${confirmCode}\n` +
        `Kedaluwarsa dalam ${Math.round(loginSessionTtlSeconds() / 60)} menit.`;

      const channelsLinked = await notifyLinkedChannels(user.id, message);

      return jsonOk({
        status: "awaiting_bot",
        sessionId,
        confirmCode,
        ttlSeconds: loginSessionTtlSeconds(),
        reason: risk.reason,
        channelsLinked,
        botMessageHint: message,
      });
    }

    return jsonOk({
      status: "approved",
      sessionId,
      ticket,
      ttlSeconds: loginSessionTtlSeconds(),
    });
  } catch (error) {
    console.error(error);
    return Response.json(
      { ok: false, error: { code: "INTERNAL", message: "Login challenge failed" } },
      { status: 500 },
    );
  }
}
