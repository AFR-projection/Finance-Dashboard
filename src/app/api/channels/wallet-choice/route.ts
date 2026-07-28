import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { phonesMatch } from "@/lib/phone";
import { rateLimit } from "@/lib/rate-limit";
import {
  cancelPendingTransaction,
  confirmPendingTransaction,
  purgeExpiredPendingTransactions,
} from "@/messaging/pending-transaction";

const schema = z.object({
  channel: z.enum(["WHATSAPP", "TELEGRAM"]),
  externalId: z.string().min(1),
  pendingId: z.string().min(1),
  walletId: z.string().min(1).optional(),
  action: z.enum(["confirm", "cancel"]).default("confirm"),
});

async function findChannelLink(channel: "WHATSAPP" | "TELEGRAM", externalId: string) {
  const exact = await prisma.channelLink.findUnique({
    where: { channel_externalId: { channel, externalId } },
  });
  if (exact || channel !== "WHATSAPP") return exact;

  const candidates = await prisma.channelLink.findMany({ where: { channel, isActive: true } });
  return candidates.find((candidate) => phonesMatch(candidate.externalId, externalId)) ?? null;
}

function formatAmount(amount: number, currency: string) {
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

/** Called by the chat workers when the user taps a wallet button. */
export async function POST(request: Request) {
  const secret = request.headers.get("x-worker-secret");
  if (!secret || secret !== process.env.WHATSAPP_WORKER_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = schema.parse(await request.json());
    const rl = rateLimit(`wallet-choice:${body.channel}:${body.externalId}`, 40);
    if (!rl.ok) {
      return NextResponse.json({ ok: false, error: "Rate limited" }, { status: 429 });
    }

    const link = await findChannelLink(body.channel, body.externalId);
    if (!link || !link.isActive) {
      return NextResponse.json({ ok: false, error: "Akun belum terhubung." }, { status: 403 });
    }

    await purgeExpiredPendingTransactions();

    if (body.action === "cancel") {
      const cancelled = await cancelPendingTransaction(body.pendingId, link.userId);
      return NextResponse.json({
        ok: true,
        data: {
          text: cancelled
            ? "Dibatalkan. Transaksi tidak dicatat."
            : "Permintaan ini sudah tidak berlaku.",
        },
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
    });

    if (!transaction) {
      return NextResponse.json({
        ok: true,
        data: { text: "Permintaan ini sudah diproses atau sudah kedaluwarsa." },
      });
    }

    const sign = transaction.type === "INCOME" ? "Pemasukan" : "Pengeluaran";
    return NextResponse.json({
      ok: true,
      data: {
        text:
          `✅ ${sign} tercatat di ${wallet.name}\n` +
          `${formatAmount(transaction.amount, wallet.currency)} • ${transaction.category?.name ?? "Lainnya"}\n` +
          `${transaction.description}`,
      },
    });
  } catch (error) {
    console.error("[wallet-choice] error:", error);
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ ok: false, error: "Wallet choice failed" }, { status });
  }
}
