import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import {
  cancelPendingTransaction,
  confirmPendingTransaction,
  purgeExpiredPendingTransactions,
} from "@/messaging/pending-transaction";
import { recordedTransactionText } from "@/messaging/wallet-choice";
import { appendHistory } from "@/ai/conversation-store";

const schema = z.object({
  channel: z.literal("TELEGRAM"),
  externalId: z.string().min(1),
  pendingId: z.string().min(1),
  walletId: z.string().min(1).optional(),
  action: z.enum(["confirm", "cancel"]).default("confirm"),
});

/** Called by the chat workers when the user taps a wallet button. */
export async function POST(request: Request) {
  const secret = request.headers.get("x-worker-secret");
  if (!secret || secret !== process.env.WORKER_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = schema.parse(await request.json());
    const rl = rateLimit(`wallet-choice:${body.channel}:${body.externalId}`, 40);
    if (!rl.ok) {
      return NextResponse.json({ ok: false, error: "Rate limited" }, { status: 429 });
    }

    const link = await prisma.channelLink.findUnique({
      where: { channel_externalId: { channel: body.channel, externalId: body.externalId } },
    });
    if (!link || !link.isActive) {
      return NextResponse.json({ ok: false, error: "Akun belum terhubung." }, { status: 403 });
    }

    await purgeExpiredPendingTransactions();

    if (body.action === "cancel") {
      const cancelled = await cancelPendingTransaction(body.pendingId, link.userId, body.channel);
      const text = cancelled
        ? "Dibatalkan. Transaksi tidak dicatat."
        : "Permintaan ini sudah tidak berlaku.";
      if (cancelled) {
        await appendHistory(link.userId, body.channel, [
          { role: "user", content: "Batalkan transaksi" },
          { role: "assistant", content: text },
        ]);
      }
      return NextResponse.json({
        ok: true,
        data: { text },
      });
    }

    if (!body.walletId) {
      return NextResponse.json({ ok: false, error: "walletId required" }, { status: 400 });
    }

    const wallet = await prisma.wallet.findFirst({
      where: { id: body.walletId, userId: link.userId, isActive: true },
      select: { name: true, currency: true },
    });
    if (!wallet) {
      return NextResponse.json({ ok: false, error: "Rekening tidak ditemukan." }, { status: 404 });
    }

    const transaction = await confirmPendingTransaction({
      pendingId: body.pendingId,
      userId: link.userId,
      walletId: body.walletId,
      channel: body.channel,
    });

    if (!transaction) {
      return NextResponse.json({
        ok: true,
        data: { text: "Permintaan ini sudah diproses atau sudah kedaluwarsa." },
      });
    }

    const text = recordedTransactionText({
      type: transaction.type,
      amount: transaction.amount,
      walletName: wallet.name,
      currency: wallet.currency,
      categoryName: transaction.category?.name ?? null,
      description: transaction.description,
    });
    await appendHistory(link.userId, body.channel, [
      { role: "user", content: `Gunakan rekening ${wallet.name}` },
      { role: "assistant", content: text },
    ]);
    return NextResponse.json({ ok: true, data: { text } });
  } catch (error) {
    console.error("[wallet-choice] error:", error);
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ ok: false, error: "Wallet choice failed" }, { status });
  }
}
