import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import type { AiRuntimeConfig } from "./agent";

export async function resolveAiConfig(userId: string): Promise<AiRuntimeConfig> {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const provider = settings?.aiProvider ?? "GEMINI";
  const model =
    settings?.aiModel ??
    (provider === "GEMINI" ? "gemini-2.0-flash" : "openai/gpt-4o-mini");

  let apiKey = "";
  if (settings?.encryptedApiKey) {
    try {
      apiKey = decryptSecret(settings.encryptedApiKey);
    } catch {
      apiKey = "";
    }
  }

  if (!apiKey) {
    apiKey =
      provider === "GEMINI"
        ? process.env.GEMINI_API_KEY || ""
        : process.env.OPENROUTER_API_KEY || "";
  }

  return { provider, model, apiKey };
}
