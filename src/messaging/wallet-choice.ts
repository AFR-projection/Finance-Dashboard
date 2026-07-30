/**
 * Pure presentation and matching helpers for the wallet confirmation flow.
 * Kept free of database imports so the chat workers can use them without
 * pulling Prisma into their runtime.
 */

export type WalletChoice = { id: string; name: string; currency: string };

export type WalletPrompt = {
  pendingId: string;
  question: string;
  wallets: WalletChoice[];
};

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
        {
          text: `${w.name} (${w.currency})`,
          callback_data: walletCallbackData(prompt.pendingId, w.id),
        },
      ]),
      [{ text: "Batalkan", callback_data: walletCallbackData(prompt.pendingId, null) }],
    ],
  };
}

/**
 * Resolves a typed reply to the account buttons above. Matching runs
 * server-side rather than through the model so a plain "2" can never land on
 * the wrong account. Returns undefined when the reply is not a choice at all,
 * so the message falls through to the agent as ordinary conversation.
 */
export function resolveWalletReply(
  reply: string,
  wallets: Array<{ id: string; name: string }>,
): { walletId: string | null } | undefined {
  const text = reply.trim().toLowerCase().replace(/[.)]+$/, "");
  if (!text) return undefined;

  if (text === "0" || text === "batal" || text === "batalkan" || text === "cancel") {
    return { walletId: null };
  }

  if (/^\d{1,2}$/.test(text)) {
    const wallet = wallets[Number(text) - 1];
    return wallet ? { walletId: wallet.id } : undefined;
  }

  const exact = wallets.filter((w) => w.name.toLowerCase() === text);
  if (exact.length === 1) return { walletId: exact[0].id };

  // A partial name is only safe when exactly one account can match it.
  const prefixed = wallets.filter((w) => w.name.toLowerCase().startsWith(text));
  if (prefixed.length === 1) return { walletId: prefixed[0].id };

  return undefined;
}

export function formatWalletAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "IDR" ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("id-ID")}`;
  }
}

export function recordedTransactionText(params: {
  type: "INCOME" | "EXPENSE";
  amount: number;
  walletName: string;
  currency: string;
  categoryName: string | null;
  description: string;
}): string {
  const label = params.type === "INCOME" ? "Pemasukan" : "Pengeluaran";
  return (
    `✅ ${label} tercatat di ${params.walletName}\n` +
    `${formatWalletAmount(params.amount, params.currency)} • ${params.categoryName ?? "Lainnya"}\n` +
    params.description
  );
}
