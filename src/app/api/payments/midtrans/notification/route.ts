import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { emitAdminEvent } from "@/lib/admin-realtime";
import { formatIdr } from "@/lib/admin-metrics";
import { getMidtransKeys, grantPremium, verifySignature } from "@/lib/midtrans";
import { sendTelegramMessage } from "@/lib/app-config";

const schema = z.object({
  order_id: z.string().min(1),
  status_code: z.string().min(1),
  gross_amount: z.string().min(1),
  signature_key: z.string().min(1),
  transaction_status: z.string().min(1),
  fraud_status: z.string().optional(),
});

/** Midtrans treats these as "money received". */
const PAID = new Set(["settlement", "capture"]);

/**
 * Midtrans payment webhook.
 *
 * Two rules matter here and both are load-bearing:
 *  - the sha512 signature must match, or anyone could grant themselves Premium;
 *  - the same notification may arrive many times, so granting must happen only
 *    on the transition into a paid state — never on a repeat.
 */
export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const body = schema.parse(raw);

    const keys = await getMidtransKeys();
    if (!keys) {
      return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });
    }

    if (
      !verifySignature({
        orderId: body.order_id,
        statusCode: body.status_code,
        grossAmount: body.gross_amount,
        signatureKey: body.signature_key,
        serverKey: keys.serverKey,
      })
    ) {
      console.warn("[midtrans] signature tidak cocok", { orderId: body.order_id });
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 403 });
    }

    const payment = await prisma.payment.findUnique({
      where: { orderId: body.order_id },
      select: { id: true, userId: true, status: true },
    });
    if (!payment) {
      return NextResponse.json({ ok: false, error: "Unknown order" }, { status: 404 });
    }

    const isPaid =
      PAID.has(body.transaction_status) && body.fraud_status !== "deny";
    const alreadyPaid = PAID.has(payment.status);

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: body.transaction_status,
        paidAt: isPaid && !alreadyPaid ? new Date() : undefined,
        raw,
      },
    });

    // The guard that stops a duplicate delivery from buying a second 30 days.
    if (isPaid && !alreadyPaid) {
      const sub = await grantPremium(payment.userId);
      const user = await prisma.user.findUnique({
        where: { id: payment.userId },
        select: { telegramChatId: true, username: true, name: true },
      });
      if (user?.telegramChatId) {
        await sendTelegramMessage(
          user.telegramChatId,
          `🎉 Pembayaran diterima. Premium aktif sampai ` +
            `${sub.currentPeriodEnd.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}.`,
        );
      }

      const who = user?.username ? `@${user.username}` : user?.name || "pengguna";
      emitAdminEvent({
        kind: "payment.paid",
        summary: `${who} membayar ${formatIdr(Number(body.gross_amount))}`,
        tone: "positive",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[midtrans] webhook error", error);
    return NextResponse.json({ ok: false, error: "Webhook failed" }, { status: 500 });
  }
}
