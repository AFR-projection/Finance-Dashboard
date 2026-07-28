import { prisma } from "@/lib/db";

/**
 * A transaction the agent understood but did not write, because more than one
 * wallet could plausibly be charged. The chat worker turns `wallets` into
 * one button per account and calls back with the chosen id.
 */
export type WalletPrompt = {
  pendingId: string;
  question: string;
  wallets: Array<{ id: string; name: string; currency: string }>;
};

export const WALLET_PROMPT_MARKER = "__walletPrompt" as const;

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

/** Telegram caps callback_data at 64 bytes; two cuids plus the prefix fit. */
export const WALLET_CALLBACK_PATTERN = /^wallet:([a-z0-9]{1,28}):([a-z0-9]{1,28}|cancel)$/;

export function walletCallbackData(pendingId: string, walletId: string | null) {
  return `wallet:${pendingId}:${walletId ?? "cancel"}`;
}

export function parseWalletCallback(
  data: string,
): { pendingId: string; walletId: string | null } | null {
  const match = data.match(WALLET_CALLBACK_PATTERN);
  if (!match) return null;
  return { pendingId: match[1], walletId: match[2] === "cancel" ? null : match[2] };
}

/** One button per account, plus an explicit out so a draft is never stuck. */
export function walletKeyboard(prompt: WalletPrompt) {
  return {
    inline_keyboard: [
      ...prompt.wallets.map((w) => [
        { text: `${w.name} (${w.currency})`, callback_data: walletCallbackData(prompt.pendingId, w.id) },
      ]),
      [{ text: "Batalkan", callback_data: walletCallbackData(prompt.pendingId, null) }],
    ],
  };
}
