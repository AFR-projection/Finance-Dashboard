import { NextResponse } from "next/server";
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
import { normalizeUsername } from "@/lib/username";

const schema = z.object({
  username: z.string().min(1).max(40),
  fingerprintId: z.string().min(8).max(128),
});

/** Same shape for every failure, so the endpoint cannot be used to enumerate usernames. */
const GENERIC_FAILURE = {
  ok: false as const,
  error: {
    code: "LOGIN_FAILED",
    message: "Username tidak dikenal atau Telegram-nya belum tertaut.",
  },
};

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request.headers);
    const rl = rateLimit(`login-start:${ip}`, 15, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: { code: "RATE_LIMITED", message: "Terlalu banyak percobaan." } },
        { status: 429 },
      );
    }

    const body = schema.parse(await request.json());
    const check = normalizeUsername(body.username);
    if (!check.ok) return NextResponse.json(GENERIC_FAILURE, { status: 404 });

    const user = await prisma.user.findUnique({
      where: { username: check.value },
      select: { id: true, telegramChatId: true, status: true },
    });
    if (!user || !user.telegramChatId) {
      return NextResponse.json(GENERIC_FAILURE, { status: 404 });
    }
    if (user.status === "SUSPENDED") {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "SUSPENDED", message: "Akun ini ditangguhkan. Hubungi admin." },
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
      purpose: "LOGIN",
      userId: user.id,
    });

    const where = [geo.city, geo.country].filter(Boolean).join(", ");
    const sent = await sendTelegramMessage(
      user.telegramChatId,
      `🔐 Permintaan masuk ke Ledgerly\n\n` +
        `Kode: ${confirmCode}\n` +
        `IP: ${ip}${where ? ` (${where})` : ""}\n` +
        `Perangkat: ${ua.slice(0, 120)}\n\n` +
        `Kalau ini bukan kamu, tekan Tolak.\n` +
        `Berlaku ~${Math.round(accessTtlSeconds() / 60)} menit.`,
      { approveCode: confirmCode },
    );

    logSuspiciousLogin({
      type: "login_requested",
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
        // A 403 from Telegram means they deleted the chat with the bot; the only
        // way back is pressing Start again, so the UI must offer that link.
        needsStart: Boolean(sent.needsStart),
        message: sent.delivered
          ? "Konfirmasi terkirim ke Telegram kamu. Tekan Izinkan di bot."
          : "Gagal mengirim ke Telegram kamu. Buka bot dan tekan Start, lalu coba lagi.",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID", message: "Data tidak valid." } },
        { status: 400 },
      );
    }
    console.error(error);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "Gagal memulai proses masuk." } },
      { status: 500 },
    );
  }
}
