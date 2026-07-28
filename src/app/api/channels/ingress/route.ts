import { NextResponse } from "next/server";
import { z } from "zod";
import { runFinanceAgent } from "@/ai/agent";
import { resolveAiConfig } from "@/ai/resolve-config";
import { prisma } from "@/lib/db";
import { phonesMatch } from "@/lib/phone";
import { rateLimit } from "@/lib/rate-limit";
import { settlePendingWalletReply } from "@/messaging/settle-wallet-reply";

const payloadSchema = z.object({
  channel: z.enum(["WHATSAPP", "TELEGRAM"]),
  externalId: z.string().min(1),
  message: z.string().min(1).max(4000),
});

/**
 * WhatsApp reports the sender in full E.164, but an owner may have saved their
 * number nationally (`0812…`) or without a dial code, so an exact lookup misses.
 */
async function findChannelLink(channel: "WHATSAPP" | "TELEGRAM", externalId: string) {
  const exact = await prisma.channelLink.findUnique({
    where: { channel_externalId: { channel, externalId } },
  });
  if (exact || channel !== "WHATSAPP") return exact;

  const candidates = await prisma.channelLink.findMany({ where: { channel, isActive: true } });
  return candidates.find((candidate) => phonesMatch(candidate.externalId, externalId)) ?? null;
}

export async function POST(request: Request) {
  const secret = request.headers.get("x-worker-secret");
  if (!secret || secret !== process.env.WHATSAPP_WORKER_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = payloadSchema.parse(await request.json());

    const rl = rateLimit(`channel:${body.channel}:${body.externalId}`, 30);
    if (!rl.ok) {
      return NextResponse.json({ ok: false, error: "Rate limited" }, { status: 429 });
    }

    const link = await findChannelLink(body.channel, body.externalId);

    if (!link || !link.isActive) {
      return NextResponse.json({
        ok: true,
        data: {
          text:
            "Akun belum terhubung. Buka dashboard > Channels, lalu tautkan WhatsApp/Telegram Anda.",
          toolsUsed: [],
        },
      });
    }

    const config = await resolveAiConfig(link.userId);

    // A pending wallet choice is resolved here rather than by the model, so a
    // bare "2" can never be matched to the wrong account. Unrecognised replies
    // fall through and are treated as an ordinary message.
    const settled = await settlePendingWalletReply({
      userId: link.userId,
      channel: body.channel,
      reply: body.message,
    });
    if (settled) {
      return NextResponse.json({ ok: true, data: { text: settled, toolsUsed: [] } });
    }

    const reply = await runFinanceAgent({
      userId: link.userId,
      message: body.message,
      config,
      channel: body.channel,
    });

    return NextResponse.json({
      ok: true,
      data: { text: reply.text, toolsUsed: reply.toolsUsed, walletPrompt: reply.walletPrompt },
    });  } catch (error) {
    console.error("[ingress] error:", error);
    const message =
      error instanceof z.ZodError
        ? "Invalid payload"
        : "Channel processing failed";
    return NextResponse.json(
      {
        ok: false,
        data: {
          text: "Maaf, terjadi kesalahan sistem. Coba lagi sebentar.",
          toolsUsed: [],
        },
        error: message,
      },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
}
