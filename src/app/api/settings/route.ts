import { encryptSecret, maskSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { aiSettingsSchema } from "@/finance-engine/schemas";
import { FinanceEngine } from "@/finance-engine";
import { jsonOk, withApiGuard } from "@/lib/api";

export async function GET(request: Request) {
  return withApiGuard(request, async (userId) => {
    const settings = await FinanceEngine.ensureUserSettings(userId);
    return jsonOk({
      aiProvider: settings.aiProvider,
      aiModel: settings.aiModel,
      hasApiKey: Boolean(settings.encryptedApiKey),
      apiKeyMasked: settings.encryptedApiKey ? "••••••••••••" : null,
      currency: settings.currency,
      timezone: settings.timezone,
      locale: settings.locale,
    });
  });
}

export async function PUT(request: Request) {
  return withApiGuard(request, async (userId) => {
    const body = aiSettingsSchema.parse(await request.json());
    const data: {
      aiProvider: "GEMINI" | "OPENROUTER";
      aiModel: string;
      currency?: string;
      timezone?: string;
      encryptedApiKey?: string;
    } = {
      aiProvider: body.aiProvider,
      aiModel: body.aiModel,
      currency: body.currency,
      timezone: body.timezone,
    };

    if (body.apiKey) {
      data.encryptedApiKey = encryptSecret(body.apiKey);
    }

    const settings = await prisma.userSettings.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });

    return jsonOk({
      aiProvider: settings.aiProvider,
      aiModel: settings.aiModel,
      hasApiKey: Boolean(settings.encryptedApiKey),
      apiKeyMasked: maskSecret(body.apiKey),
      currency: settings.currency,
      timezone: settings.timezone,
    });
  });
}
