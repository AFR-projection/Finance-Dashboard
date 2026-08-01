import { decryptSecret } from "@/lib/crypto";
import { getAppConfigRaw } from "@/lib/app-config";
import type { AiRuntimeConfig } from "./agent";

const DEFAULT_MODEL = "openai/gpt-4o-mini";

/**
 * Platform-wide AI credentials.
 *
 * The key and the model both come from AppConfig, never from the user: while
 * the model was a free-text field in user settings, any account could point it
 * at an expensive model and spend the admin's budget.
 */
export async function resolveAiConfig(_userId?: string): Promise<AiRuntimeConfig> {
  const cfg = await getAppConfigRaw();

  let apiKey = "";
  if (cfg.openrouterApiKey) {
    try {
      apiKey = decryptSecret(cfg.openrouterApiKey);
    } catch {
      apiKey = "";
    }
  }
  // Env stays as the bootstrap path so a fresh install works before an admin
  // has opened the panel.
  if (!apiKey) apiKey = process.env.OPENROUTER_API_KEY || "";

  const fallbackModels = (cfg.aiFallbackModels || process.env.OPENROUTER_FALLBACK_MODELS || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  return {
    provider: "OPENROUTER",
    model: cfg.aiModel || DEFAULT_MODEL,
    apiKey,
    fallbackModels,
  };
}
