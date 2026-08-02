import { NextResponse } from "next/server";
import { z } from "zod";
import { runFinanceAgent } from "@/ai/agent";
import { requireAiAccess } from "@/ai/entitlement";
import { FinanceEngineError } from "@/finance-engine";
import { resolveAiConfig } from "@/ai/resolve-config";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { settlePendingWalletReply } from "@/messaging/settle-wallet-reply";
import { appendHistory } from "@/ai/conversation-store";

const payloadSchema = z.object({
  channel: z.literal("TELEGRAM"),
  externalId: z.string().min(1),
  message: z.string().min(1).max(4000),
});

export async function POST(request: Request) {
  const secret = request.headers.get("x-worker-secret");
  if (!secret || secret !== process.env.WORKER_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = payloadSchema.parse(await request.json());

    const rl = rateLimit(`channel:${body.channel}:${body.externalId}`, 30);
    if (!rl.ok) {
      return NextResponse.json({ ok: false, error: "Rate limited" }, { status: 429 });
    }

    const link = await prisma.channelLink.findUnique({
      where: { channel_externalId: { channel: body.channel, externalId: body.externalId } },
    });

    if (!link || !link.isActive) {
      return NextResponse.json({
        ok: true,
        data: {
          text: "Akun belum terhubung. Buka dashboard > Channels, lalu tautkan Telegram Anda.",
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
      await appendHistory(link.userId, body.channel, [
        { role: "user", content: body.message },
        { role: "assistant", content: settled },
      ]);
      return NextResponse.json({ ok: true, data: { text: settled, toolsUsed: [] } });
    }

    // Paywall sits after the wallet-choice settlement above, which is a plain
    // database write. Telegram gets the quota message as ordinary bot text.
    try {
      await requireAiAccess(link.userId, "CHAT");
    } catch (error) {
      if (error instanceof FinanceEngineError) {
        return NextResponse.json({
          ok: true,
          data: { text: `${error.message}\n\nUpgrade lewat dashboard web.`, toolsUsed: [] },
        });
      }
      throw error;
    }

    const reply = await runFinanceAgent({
      userId: link.userId,
      message: body.message,
      config,
      channel: body.channel,
    });

    return NextResponse.json({
      ok: true,
      data: {
        text: reply.text,
        toolsUsed: reply.toolsUsed,
        walletPrompt: reply.walletPrompt,
        walletPrompts: reply.walletPrompts,
      },
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
