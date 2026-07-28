import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import * as FinanceEngine from "@/finance-engine";

/** Long enough for the user to read the buttons, short enough not to pile up. */
const TTL_MINUTES = 30;

export type PendingTransactionDraft = {
  userId: string;
  channel: "WHATSAPP" | "TELEGRAM" | "WEB";
  type: "INCOME" | "EXPENSE";
  amount: number;
  category: string;
  description: string;
  paymentMethod?: string;
  transactionDate: Date;
  rawInput?: string;
};

export async function createPendingTransaction(draft: PendingTransactionDraft) {
  // Only the newest draft can be confirmed — an older one still holding buttons
  // would otherwise let a stale amount be recorded by a late tap.
  await prisma.pendingTransaction.deleteMany({
    where: { userId: draft.userId, channel: draft.channel },
  });

  return prisma.pendingTransaction.create({
    data: {
      userId: draft.userId,
      channel: draft.channel,
      type: draft.type,
      amount: new Prisma.Decimal(draft.amount),
      category: draft.category,
      description: draft.description,
      paymentMethod: draft.paymentMethod ?? null,
      transactionDate: draft.transactionDate,
      rawInput: draft.rawInput ?? null,
      expiresAt: new Date(Date.now() + TTL_MINUTES * 60 * 1000),
    },
  });
}

export async function purgeExpiredPendingTransactions() {
  await prisma.pendingTransaction.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

export async function findLivePendingTransaction(
  userId: string,
  channel: "WHATSAPP" | "TELEGRAM" | "WEB",
) {
  return prisma.pendingTransaction.findFirst({
    where: { userId, channel, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Claims the draft by deleting it first, so a second tap on the same buttons
 * finds nothing and cannot record the transaction twice. Returns null when the
 * draft is already gone, expired, or belongs to someone else.
 */
export async function confirmPendingTransaction(params: {
  pendingId: string;
  userId: string;
  walletId: string;
  channel?: "WHATSAPP" | "TELEGRAM" | "WEB";
}) {
  const pending = await prisma.pendingTransaction.findFirst({
    where: {
      id: params.pendingId,
      userId: params.userId,
      channel: params.channel,
      expiresAt: { gt: new Date() },
    },
  });
  if (!pending) return null;

  const claimed = await prisma.pendingTransaction.deleteMany({ where: { id: pending.id } });
  if (claimed.count === 0) return null;

  const transaction = await FinanceEngine.createTransaction(params.userId, {
    type: pending.type,
    amount: Number(pending.amount),
    category: pending.category,
    description: pending.description,
    paymentMethod: pending.paymentMethod ?? undefined,
    transactionDate: pending.transactionDate,
    channel: pending.channel,
    rawInput: pending.rawInput ?? undefined,
    walletId: params.walletId,
  });

  return transaction;
}

export async function cancelPendingTransaction(
  pendingId: string,
  userId: string,
  channel?: "WHATSAPP" | "TELEGRAM" | "WEB",
) {
  const deleted = await prisma.pendingTransaction.deleteMany({
    where: { id: pendingId, userId, channel },
  });
  return deleted.count > 0;
}
