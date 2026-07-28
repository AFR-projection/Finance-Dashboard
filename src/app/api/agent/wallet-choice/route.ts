import { z } from "zod";
import { FinanceEngineError } from "@/finance-engine";
import { appendHistory } from "@/ai/conversation-store";
import { jsonOk, withApiGuard } from "@/lib/api";
import { prisma } from "@/lib/db";
import {
  cancelPendingTransaction,
  confirmPendingTransaction,
  purgeExpiredPendingTransactions,
} from "@/messaging/pending-transaction";
import { recordedTransactionText } from "@/messaging/wallet-choice";

const walletChoiceSchema = z.object({
  pendingId: z.string().min(1),
  walletId: z.string().min(1).optional(),
  action: z.enum(["confirm", "cancel"]).default("confirm"),
});

/** Completes a WEB wallet choice without sending the selection through the LLM. */
export async function POST(request: Request) {
  return withApiGuard(
    request,
    async (userId) => {
      const body = walletChoiceSchema.parse(await request.json());
      await purgeExpiredPendingTransactions();

      if (body.action === "cancel") {
        const cancelled = await cancelPendingTransaction(body.pendingId, userId, "WEB");
        const text = cancelled
          ? "Dibatalkan. Transaksi tidak dicatat."
          : "Permintaan ini sudah tidak berlaku.";
        if (cancelled) {
          await appendHistory(userId, "WEB", [
            { role: "user", content: "Batalkan transaksi" },
            { role: "assistant", content: text },
          ]);
        }
        return jsonOk({ text });
      }

      if (!body.walletId) {
        throw new FinanceEngineError(
          "Pilih salah satu rekening atau batalkan transaksi.",
          "WALLET_REQUIRED",
          400,
        );
      }

      const wallet = await prisma.wallet.findFirst({
        where: { id: body.walletId, userId, isActive: true },
        select: { name: true, currency: true },
      });
      if (!wallet) {
        throw new FinanceEngineError(
          "Rekening tidak ditemukan atau sudah tidak aktif.",
          "WALLET_NOT_FOUND",
          404,
        );
      }

      const transaction = await confirmPendingTransaction({
        pendingId: body.pendingId,
        userId,
        walletId: body.walletId,
        channel: "WEB",
      });
      if (!transaction) {
        return jsonOk({ text: "Permintaan ini sudah diproses atau sudah kedaluwarsa." });
      }

      const text = recordedTransactionText({
        type: transaction.type,
        amount: transaction.amount,
        walletName: wallet.name,
        currency: wallet.currency,
        categoryName: transaction.category?.name ?? null,
        description: transaction.description,
      });
      await appendHistory(userId, "WEB", [
        { role: "user", content: `Gunakan rekening ${wallet.name}` },
        { role: "assistant", content: text },
      ]);
      return jsonOk({ text });
    },
    { rateLimitKey: "agent-wallet-choice", limit: 60 },
  );
}
