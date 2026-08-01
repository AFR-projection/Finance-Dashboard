import { prisma } from "@/lib/db";
import { aiSettingsSchema } from "@/finance-engine/schemas";
import { FinanceEngine } from "@/finance-engine";
import { jsonOk, requireAdmin, withApiGuard } from "@/lib/api";
import { getAppConfig, updateOwnerBotConfig } from "@/lib/app-config";

export async function GET(request: Request) {
  return withApiGuard(request, async (userId) => {
    const settings = await FinanceEngine.ensureUserSettings(userId);
    const isAdmin = await prisma.user
      .findUnique({ where: { id: userId }, select: { role: true } })
      .then((u) => u?.role === "ADMIN");
    const owner = await getAppConfig();
    return jsonOk({
      currency: settings.currency,
      timezone: settings.timezone,
      locale: settings.locale,
      heartbeatEnabled: settings.heartbeatEnabled,
      heartbeatHour: settings.heartbeatHour,
      // Platform bot config belongs to admins; a normal user must not see it.
      owner: isAdmin
        ? {
            ownerName: owner.ownerName,
            hasTelegram: owner.hasTelegram,
            telegramOwnerChatId: owner.telegramOwnerChatId,
            isReady: owner.isReady,
          }
        : null,
    });
  });
}

export async function PUT(request: Request) {
  return withApiGuard(request, async (userId) => {
    const body = await request.json();
    const section = body.section || "ai";

    if (section === "owner") {
      // Mutates the platform-wide bot token, so it stays admin-only.
      await requireAdmin();
      try {
        const owner = await updateOwnerBotConfig({
          ownerName: body.ownerName,
          telegramBotToken: body.telegramBotToken,
          telegramOwnerChatId: body.telegramOwnerChatId,
        });
        // keep channel links in sync
        if (owner.telegramOwnerChatId) {
          // Retire links for a previously registered chat so it can no longer
          // drive the account after the owner switches bots.
          await prisma.channelLink.deleteMany({
            where: {
              channel: "TELEGRAM",
              userId,
              externalId: { not: owner.telegramOwnerChatId },
            },
          });
          await prisma.channelLink.upsert({
            where: {
              channel_externalId: {
                channel: "TELEGRAM",
                externalId: owner.telegramOwnerChatId,
              },
            },
            update: { userId, isActive: true },
            create: {
              userId,
              channel: "TELEGRAM",
              externalId: owner.telegramOwnerChatId,
              displayName: "Owner",
            },
          });
        }
        return jsonOk({ owner });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Gagal update owner";
        return Response.json(
          { ok: false, error: { code: "OWNER", message } },
          { status: 400 },
        );
      }
    }

    const parsed = aiSettingsSchema.parse(body);
    const settings = await prisma.userSettings.upsert({
      where: { userId },
      update: {
        currency: parsed.currency,
        timezone: parsed.timezone,
        heartbeatEnabled: parsed.heartbeatEnabled,
        heartbeatHour: parsed.heartbeatHour,
      },
      create: {
        userId,
        currency: parsed.currency,
        timezone: parsed.timezone,
        heartbeatEnabled: parsed.heartbeatEnabled,
        heartbeatHour: parsed.heartbeatHour,
      },
    });

    return jsonOk({
      currency: settings.currency,
      timezone: settings.timezone,
      heartbeatEnabled: settings.heartbeatEnabled,
      heartbeatHour: settings.heartbeatHour,
    });
  });
}
