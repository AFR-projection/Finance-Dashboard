import { encryptSecret, maskSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { aiSettingsSchema } from "@/finance-engine/schemas";
import { FinanceEngine } from "@/finance-engine";
import { jsonOk, withApiGuard } from "@/lib/api";
import { getAppConfig, updateOwnerBotConfig } from "@/lib/app-config";

export async function GET(request: Request) {
  return withApiGuard(request, async (userId) => {
    const settings = await FinanceEngine.ensureUserSettings(userId);
    const owner = await getAppConfig();
    return jsonOk({
      aiProvider: settings.aiProvider,
      aiModel: settings.aiModel,
      hasApiKey: Boolean(settings.encryptedApiKey),
      apiKeyMasked: settings.encryptedApiKey ? "••••••••••••" : null,
      currency: settings.currency,
      timezone: settings.timezone,
      locale: settings.locale,
      owner: {
        ownerName: owner.ownerName,
        hasTelegram: owner.hasTelegram,
        hasWhatsApp: owner.hasWhatsApp,
        telegramOwnerChatId: owner.telegramOwnerChatId,
        whatsappOwnerPhone: owner.whatsappOwnerPhone,
        isReady: owner.isReady,
      },
    });
  });
}

export async function PUT(request: Request) {
  return withApiGuard(request, async (userId) => {
    const body = await request.json();
    const section = body.section || "ai";

    if (section === "owner") {
      try {
        const owner = await updateOwnerBotConfig({
          ownerName: body.ownerName,
          telegramBotToken: body.telegramBotToken,
          telegramOwnerChatId: body.telegramOwnerChatId,
          whatsappOwnerPhone: body.whatsappOwnerPhone,
        });
        // keep channel links in sync
        if (owner.telegramOwnerChatId) {
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
        if (owner.whatsappOwnerPhone) {
          await prisma.channelLink.upsert({
            where: {
              channel_externalId: {
                channel: "WHATSAPP",
                externalId: owner.whatsappOwnerPhone,
              },
            },
            update: { userId, isActive: true },
            create: {
              userId,
              channel: "WHATSAPP",
              externalId: owner.whatsappOwnerPhone,
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
    const data: {
      aiProvider: "GEMINI" | "OPENROUTER";
      aiModel: string;
      currency?: string;
      timezone?: string;
      encryptedApiKey?: string;
    } = {
      aiProvider: parsed.aiProvider,
      aiModel: parsed.aiModel,
      currency: parsed.currency,
      timezone: parsed.timezone,
    };
    if (parsed.apiKey) data.encryptedApiKey = encryptSecret(parsed.apiKey);

    const settings = await prisma.userSettings.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });

    return jsonOk({
      aiProvider: settings.aiProvider,
      aiModel: settings.aiModel,
      hasApiKey: Boolean(settings.encryptedApiKey),
      apiKeyMasked: maskSecret(parsed.apiKey),
      currency: settings.currency,
      timezone: settings.timezone,
    });
  });
}
