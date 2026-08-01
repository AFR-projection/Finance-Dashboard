import { NextResponse } from "next/server";
import { z } from "zod";
import { getEntitlement } from "@/ai/entitlement";
import { sendTelegramMessage, getAppConfigRaw, getBotUsername } from "@/lib/app-config";
import { jsonOk, withApiGuard } from "@/lib/api";
import { prisma } from "@/lib/db";

const schema = z.object({
  chatId: z.string().regex(/^\d{5,20}$/, "Chat ID hanya berisi angka."),
});

export async function GET(request: Request) {
  return withApiGuard(request, async (userId) => {
    const [user, entitlement, cfg, botUsername] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, name: true, telegramChatId: true, createdAt: true },
      }),
      getEntitlement(userId),
      getAppConfigRaw(),
      getBotUsername(),
    ]);

    const daysLeft = entitlement.periodEnd
      ? Math.max(0, Math.ceil((entitlement.periodEnd.getTime() - Date.now()) / 86_400_000))
      : 0;

    return jsonOk({
      username: user?.username ?? null,
      name: user?.name ?? null,
      telegramChatId: user?.telegramChatId ?? null,
      memberSince: user?.createdAt ?? null,
      botUsername,
      tier: entitlement.tier,
      quota: entitlement.quota,
      used: entitlement.used,
      unlimited: entitlement.quota === 0,
      daysLeft: entitlement.tier === "PREMIUM" ? daysLeft : 0,
      priceIdr: cfg.premiumPriceIdr,
      paymentsEnabled: Boolean(cfg.midtransServerKey && cfg.midtransClientKey),
    });
  });
}

/**
 * Changing the linked Telegram chat is the only setting a user owns — currency,
 * model, and quotas are all platform decisions now.
 *
 * The new chat id is proved the same way signup proves it: by sending to it.
 * Telegram refuses chats that never pressed Start, so a stranger's id fails
 * here instead of silently hijacking their bot.
 */
export async function PUT(request: Request) {
  return withApiGuard(
    request,
    async (userId) => {
      const parsed = schema.safeParse(await request.json());
      if (!parsed.success) {
        return NextResponse.json(
          { ok: false, error: { code: "INVALID", message: "Chat ID harus angka saja." } },
          { status: 400 },
        );
      }
      const { chatId } = parsed.data;

      const takenBy = await prisma.user.findUnique({
        where: { telegramChatId: chatId },
        select: { id: true },
      });
      if (takenBy && takenBy.id !== userId) {
        return NextResponse.json(
          {
            ok: false,
            error: { code: "CHAT_TAKEN", message: "Chat ID ini sudah dipakai akun lain." },
          },
          { status: 409 },
        );
      }

      const probe = await sendTelegramMessage(
        chatId,
        "🔗 Chat ID ini baru saja ditautkan ke akun Ledgerly kamu.",
      );
      if (!probe.delivered) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "UNVERIFIED",
              message: probe.needsStart
                ? "Tekan Start di bot dulu, lalu simpan lagi."
                : "Chat ID tidak dikenali. Periksa lagi angkanya.",
            },
          },
          { status: 400 },
        );
      }

      await prisma.$transaction([
        prisma.user.update({ where: { id: userId }, data: { telegramChatId: chatId } }),
        // The old link must go, otherwise the previous chat keeps driving this
        // account after the switch.
        prisma.channelLink.deleteMany({
          where: { userId, channel: "TELEGRAM", externalId: { not: chatId } },
        }),
      ]);
      await prisma.channelLink.upsert({
        where: { channel_externalId: { channel: "TELEGRAM", externalId: chatId } },
        update: { userId, isActive: true },
        create: { userId, channel: "TELEGRAM", externalId: chatId, isActive: true },
      });

      return jsonOk({ telegramChatId: chatId });
    },
    { rateLimitKey: "settings-chat", limit: 10 },
  );
}
