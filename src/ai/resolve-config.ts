import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import type { AiRuntimeConfig } from "./agent";

const DEFAULT_MODEL = "openai/gpt-4o-mini";

export async function resolveAiConfig(userId: string): Promise<AiRuntimeConfig> {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });

  let apiKey = "";
  if (settings?.encryptedApiKey) {
    try {
      apiKey = decryptSecret(settings.encryptedApiKey);
    } catch {
      apiKey = "";
    }
  }

  if (!apiKey) apiKey = process.env.OPENROUTER_API_KEY || "";

  const fallbackModels = (process.env.OPENROUTER_FALLBACK_MODELS || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  return {
    provider: "OPENROUTER",
    model: settings?.aiModel || DEFAULT_MODEL,
    apiKey,
    fallbackModels,
  };
}
