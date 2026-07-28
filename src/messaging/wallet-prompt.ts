import { prisma } from "@/lib/db";
import type { WalletPrompt } from "./wallet-choice";

export const WALLET_PROMPT_MARKER = "__walletPrompt" as const;

/**
 * A transaction the agent understood but did not write, because more than one
 * wallet could plausibly be charged. The chat worker renders `wallets` as
 * buttons (Telegram) or a numbered list (WhatsApp).
 */
export type WalletPromptToolResult = {
  [WALLET_PROMPT_MARKER]: WalletPrompt;
  status: "AWAITING_WALLET_CHOICE";
  note: string;
};

export function isWalletPromptResult(value: unknown): value is WalletPromptToolResult {
  return (
    typeof value === "object" &&
    value !== null &&
    WALLET_PROMPT_MARKER in (value as Record<string, unknown>)
  );
}

export async function listActiveWalletChoices(userId: string) {
  return prisma.wallet.findMany({
    where: { userId, isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true, name: true, currency: true },
  });
}
