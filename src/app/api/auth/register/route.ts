import { NextResponse } from "next/server";
import { z } from "zod";
import {
  accessTtlSeconds,
  createAccessChallenge,
  newAccessIds,
  purgeExpiredAccessChallenges,
} from "@/lib/access-challenge";
import { getBotUsername } from "@/lib/app-config";
import { prisma } from "@/lib/db";
import { getClientIp, lookupGeo } from "@/lib/geo";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeUsername } from "@/lib/username";

const schema = z.object({
  username: z.string().min(1).max(40),
  fingerprintId: z.string().min(8).max(128),
});

/**
 * Starts a signup. No account is created here: the deep link returned below is
 * what proves the person controls the Telegram chat, and the bot creates the
 * account once they press Start.
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request.headers);
    const rl = rateLimit(`register:${ip}`, 10, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: { code: "RATE_LIMITED", message: "Terlalu banyak percobaan." } },
        { status: 429 },
      );
    }

    const body = schema.parse(await request.json());
    const check = normalizeUsername(body.username);
    if (!check.ok) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_USERNAME", message: check.message } },
        { status: 400 },
      );
    }

    const taken = await prisma.user.findUnique({
      where: { username: check.value },
      select: { id: true },
    });
    if (taken) {
      return NextResponse.json(
        { ok: false, error: { code: "USERNAME_TAKEN", message: "Username sudah dipakai." } },
        { status: 409 },
      );
    }

    const botUsername = await getBotUsername();
    if (!botUsername) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "BOT_UNAVAILABLE", message: "Bot Telegram belum siap. Coba lagi nanti." },
        },
        { status: 503 },
      );
    }

    const geo = lookupGeo(ip);
    const { sessionId, confirmCode } = newAccessIds();

    await purgeExpiredAccessChallenges();
    await createAccessChallenge({
      sessionId,
      confirmCode,
      fingerprintId: body.fingerprintId,
      userAgent: request.headers.get("user-agent") || "unknown",
      ip,
      country: geo.country,
      city: geo.city,
      purpose: "REGISTER",
      username: check.value,
    });

    return NextResponse.json({
      ok: true,
      data: {
        sessionId,
        username: check.value,
        botUsername,
        botLink: `https://t.me/${botUsername}`,
        ttlSeconds: accessTtlSeconds(),
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
      { ok: false, error: { code: "INTERNAL", message: "Gagal memulai pendaftaran." } },
      { status: 500 },
    );
  }
}
