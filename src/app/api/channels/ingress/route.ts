import { NextResponse } from "next/server";
import { z } from "zod";
import { runFinanceAgent } from "@/ai/agent";
import { resolveAiConfig } from "@/ai/resolve-config";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

const payloadSchema = z.object({
  channel: z.enum(["WHATSAPP", "TELEGRAM"]),
  externalId: z.string().min(1),
  message: z.string().min(1).max(4000),
});

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

    const link = await prisma.channelLink.findUnique({
      where: {
        channel_externalId: {
          channel: body.channel,
          externalId: body.externalId,
        },
      },
    });

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
    const reply = await runFinanceAgent({
      userId: link.userId,
      message: body.message,
      config,
      channel: body.channel,
    });

    return NextResponse.json({ ok: true, data: reply });
  } catch (error) {
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
