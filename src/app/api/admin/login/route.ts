import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  accessTtlSeconds,
  createAccessChallenge,
  newAccessIds,
  purgeExpiredAccessChallenges,
} from "@/lib/access-challenge";
import { sendTelegramMessage } from "@/lib/app-config";
import { prisma } from "@/lib/db";
import { getClientIp, lookupGeo } from "@/lib/geo";
import { rateLimit } from "@/lib/rate-limit";
import { logSuspiciousLogin } from "@/lib/security-log";

const schema = z.object({
  username: z.string().min(1).max(40),
  password: z.string().min(1).max(200),
  fingerprintId: z.string().min(8).max(128),
});

/** Identical for every failure — the panel must not confirm who is an admin. */
const GENERIC = {
  ok: false as const,
  error: { code: "LOGIN_FAILED", message: "Kredensial salah." },
};

/**
 * First factor for the master admin panel. A correct password alone issues
 * nothing: it only creates an ADMIN_LOGIN challenge that Telegram must approve.
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request.headers);
    // Tighter than the user login: this endpoint guards every account's data.
    const rl = rateLimit(`admin-login:${ip}`, 8, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: { code: "RATE_LIMITED", message: "Terlalu banyak percobaan." } },
        { status: 429 },
      );
    }

    const body = schema.parse(await request.json());
    const user = await prisma.user.findUnique({
      where: { username: body.username.trim().toLowerCase() },
      select: {
        id: true,
        role: true,
        status: true,
        passwordHash: true,
        telegramChatId: true,
      },
    });

    // Hash a dummy when the user is missing so a wrong username and a wrong
    // password take the same time to answer.
    const hash = user?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin";
    const passwordOk = await bcrypt.compare(body.password, hash);

    if (!user || !user.passwordHash || !passwordOk || user.role !== "ADMIN") {
      logSuspiciousLogin({ type: "admin_login_failed", ip, fingerprintId: body.fingerprintId });
      return NextResponse.json(GENERIC, { status: 401 });
    }
    if (user.status === "SUSPENDED") {
      return NextResponse.json(GENERIC, { status: 401 });
    }
    if (!user.telegramChatId) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "NO_TELEGRAM",
            message: "Akun admin ini belum tertaut Telegram. Tautkan dulu sebelum bisa masuk.",
          },
        },
        { status: 403 },
      );
    }

    const geo = lookupGeo(ip);
    const ua = request.headers.get("user-agent") || "unknown";
    const { sessionId, confirmCode } = newAccessIds();

    await purgeExpiredAccessChallenges();
    await createAccessChallenge({
      sessionId,
      confirmCode,
      fingerprintId: body.fingerprintId,
      userAgent: ua,
      ip,
      country: geo.country,
      city: geo.city,
      purpose: "ADMIN_LOGIN",
      userId: user.id,
    });

    const where = [geo.city, geo.country].filter(Boolean).join(", ");
    const sent = await sendTelegramMessage(
      user.telegramChatId,
      `🛡️ Permintaan masuk PANEL ADMIN\n\n` +
        `Kode: ${confirmCode}\n` +
        `IP: ${ip}${where ? ` (${where})` : ""}\n` +
        `Perangkat: ${ua.slice(0, 120)}\n\n` +
        `Kalau ini bukan kamu, tekan Tolak dan segera ganti password.\n` +
        `Berlaku ~${Math.round(accessTtlSeconds() / 60)} menit.`,
      { approveCode: confirmCode },
    );

    logSuspiciousLogin({
      type: "admin_login_requested",
      ip,
      fingerprintId: body.fingerprintId,
      country: geo.country,
      reason: sent.delivered ? "TELEGRAM" : "UNDELIVERED",
    });

    return NextResponse.json({
      ok: true,
      data: {
        sessionId,
        ttlSeconds: accessTtlSeconds(),
        delivered: sent.delivered,
        message: sent.delivered
          ? "Konfirmasi dikirim ke Telegram admin. Tekan Izinkan di bot."
          : "Gagal mengirim ke Telegram. Buka bot dan tekan Start, lalu coba lagi.",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(GENERIC, { status: 400 });
    }
    console.error(error);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "Gagal memproses login." } },
      { status: 500 },
    );
  }
}
