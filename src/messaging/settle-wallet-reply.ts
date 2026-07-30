import {
  cancelPendingTransaction,
  confirmPendingTransaction,
  findLivePendingTransaction,
  purgeExpiredPendingTransactions,
} from "./pending-transaction";
import { recordedTransactionText, resolveWalletReply } from "./wallet-choice";
import { listActiveWalletChoices } from "./wallet-prompt";

/**
 * Applies a chat reply to the user's pending wallet choice. Returns the text to
 * send back, or null when the reply is not a choice — the caller then treats the
 * message as ordinary conversation.
 *
 * Matching happens here instead of in the model so a bare "2" always lands on
 * the account that was actually listed second.
 */
export async function settlePendingWalletReply(params: {
  userId: string;
  channel: "TELEGRAM" | "WEB";
  reply: string;
}): Promise<string | null> {
  await purgeExpiredPendingTransactions();

  const pending = await findLivePendingTransaction(params.userId, params.channel);
  if (!pending) return null;

  const wallets = await listActiveWalletChoices(params.userId);
  const choice = resolveWalletReply(params.reply, wallets);
  if (!choice) return null;

  if (!choice.walletId) {
    await cancelPendingTransaction(pending.id, params.userId, params.channel);
    return "Dibatalkan. Transaksi tidak dicatat.";
  }

  const wallet = wallets.find((w) => w.id === choice.walletId);
  if (!wallet) return null;

  const transaction = await confirmPendingTransaction({
    pendingId: pending.id,
    userId: params.userId,
    walletId: wallet.id,
    channel: params.channel,
  });
  if (!transaction) return "Permintaan ini sudah diproses atau sudah kedaluwarsa.";

  return recordedTransactionText({
    type: transaction.type,
    amount: transaction.amount,
    walletName: wallet.name,
    currency: wallet.currency,
    categoryName: transaction.category?.name ?? null,
    description: transaction.description,
  });
}
