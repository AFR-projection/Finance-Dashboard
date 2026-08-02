import { NextResponse } from "next/server";
import { z } from "zod";
import { ChallengePurpose } from "@prisma/client";
import { attachUserAndApprove, getAccessChallenge } from "@/lib/access-challenge";
import { emitAdminEvent } from "@/lib/admin-realtime";
import { sendTelegramMessage } from "@/lib/app-config";
import { prisma } from "@/lib/db";
import { FinanceEngine } from "@/finance-engine";
import { getClientIp } from "@/lib/geo";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({
  sessionId: z.string().min(8).max(64),
  chatId: z.string().regex(/^\d{5,20}$/, "Chat ID hanya berisi angka."),
});

/**
 * Second half of signup: the browser submits the chat id the bot showed, and we
 * prove ownership by sending a message to it. Telegram only accepts sendMessage
 * for chats that pressed Start, so a delivered message means the person holds
 * that chat — typing a stranger's id fails at this step.
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request.headers);
    const rl = rateLimit(`verify-chat:${ip}`, 12, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: { code: "RATE_LIMITED", message: "Terlalu banyak percobaan." } },
        { status: 429 },
      );
    }

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "INVALID", message: "Chat ID tidak valid — isinya harus angka saja." },
        },
        { status: 400 },
      );
    }
    const { sessionId, chatId } = parsed.data;

    const challenge = await getAccessChallenge(sessionId);
    if (
      !challenge ||
      challenge.purpose !== ChallengePurpose.REGISTER ||
      !challenge.username ||
      challenge.status !== "pending"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "EXPIRED", message: "Sesi pendaftaran kedaluwarsa. Ulangi dari awal." },
        },
        { status: 410 },
      );
    }

    const chatTaken = await prisma.user.findUnique({
      where: { telegramChatId: chatId },
      select: { id: true },
    });
    if (chatTaken) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "CHAT_TAKEN",
            message: "Telegram ini sudah tertaut ke akun lain. Pakai menu Masuk.",
          },
        },
        { status: 409 },
      );
    }

    const username = challenge.username;
    const usernameTaken = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (usernameTaken) {
      return NextResponse.json(
        { ok: false, error: { code: "USERNAME_TAKEN", message: "Username keburu diambil." } },
        { status: 409 },
      );
    }

    // Ownership proof. Nothing is written until Telegram accepts this.
    const probe = await sendTelegramMessage(
      chatId,
      `✅ Chat ID terverifikasi.\n\nAkun @${username} sedang diaktifkan…`,
    );
    if (!probe.delivered) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "UNVERIFIED",
            message: probe.needsStart
              ? "Belum bisa mengirim ke Chat ID itu. Tekan Start di bot dulu, lalu coba lagi."
              : "Chat ID tidak dikenali. Periksa lagi angkanya.",
          },
        },
        { status: 400 },
      );
    }

    const user = await prisma.user.create({
      data: {
        username,
        name: username,
        // Auth.js legacy column is non-null; Telegram signups have no email.
        email: `${username}@telegram.local`,
        telegramChatId: chatId,
      },
    });

    await FinanceEngine.ensureUserSettings(user.id);
    await FinanceEngine.ensureDefaultCategories(user.id);
    await prisma.channelLink.upsert({
      where: { channel_externalId: { channel: "TELEGRAM", externalId: chatId } },
      update: { userId: user.id, isActive: true, displayName: username },
      create: {
        userId: user.id,
        channel: "TELEGRAM",
        externalId: chatId,
        displayName: username,
        isActive: true,
      },
    });

    const approved = await attachUserAndApprove(sessionId, user.id);
    if (!approved) {
      return NextResponse.json(
        { ok: false, error: { code: "EXPIRED", message: "Sesi kedaluwarsa. Ulangi dari awal." } },
        { status: 410 },
      );
    }

    await sendTelegramMessage(
      chatId,
      `🎉 Akun @${username} aktif!\n\n` +
        `Mulai catat dengan mengirim pesan biasa, misalnya:\n` +
        `"beli kopi 25 ribu"\n\n` +
        `Ketik /help untuk contoh lainnya.`,
    );

    emitAdminEvent({
      kind: "user.signup",
      summary: `@${username} mendaftar lewat Telegram`,
      tone: "positive",
    });

    return NextResponse.json({ ok: true, data: { username } });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "Gagal menyelesaikan pendaftaran." } },
      { status: 500 },
    );
  }
}
