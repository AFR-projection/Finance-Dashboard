import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonOk, withApiGuard } from "@/lib/api";
import { createPairingCode, consumePairingCode } from "@/lib/pairing";
import { NextResponse } from "next/server";

const linkSchema = z.object({
  channel: z.enum(["WHATSAPP", "TELEGRAM"]),
  externalId: z.string().min(3).max(120),
  displayName: z.string().max(120).optional(),
});

export async function GET(request: Request) {
  return withApiGuard(request, async (userId) => {
    const links = await prisma.channelLink.findMany({ where: { userId } });
    const wa = await prisma.whatsAppSession.findUnique({ where: { userId } });
    return jsonOk({ links, whatsapp: wa });
  });
}

export async function POST(request: Request) {
  return withApiGuard(request, async (userId) => {
    const body = await request.json();

    if (body?.action === "pair-code") {
      const code = await createPairingCode(userId);
      return jsonOk({
        code,
        expiresInMinutes: 10,
        instructions: {
          telegram: `Kirim /link ${code} ke bot Telegram`,
          whatsapp: `Kirim: link ${code} ke nomor WhatsApp bot`,
        },
      });
    }

    const parsed = linkSchema.parse(body);
    const link = await prisma.channelLink.upsert({
      where: {
        channel_externalId: {
          channel: parsed.channel,
          externalId: parsed.externalId,
        },
      },
      update: {
        userId,
        displayName: parsed.displayName,
        isActive: true,
      },
      create: {
        userId,
        channel: parsed.channel,
        externalId: parsed.externalId,
        displayName: parsed.displayName,
      },
    });
    return jsonOk(link, { status: 201 });
  });
}

/** Worker-facing pair endpoint — authenticated via worker secret */
export async function PUT(request: Request) {
  const secret = request.headers.get("x-worker-secret");
  if (!secret || secret !== process.env.WHATSAPP_WORKER_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const schema = z.object({
    channel: z.enum(["WHATSAPP", "TELEGRAM"]),
    externalId: z.string().min(1),
    code: z.string().min(4).max(16),
    displayName: z.string().max(120).optional(),
  });

  try {
    const body = schema.parse(await request.json());
    const userId = await consumePairingCode(body.code);
    if (!userId) {
      return NextResponse.json({
        ok: true,
        data: { text: "Kode pairing tidak valid atau sudah kedaluwarsa. Generate ulang di dashboard." },
      });
    }

    await prisma.channelLink.upsert({
      where: {
        channel_externalId: {
          channel: body.channel,
          externalId: body.externalId,
        },
      },
      update: { userId, displayName: body.displayName, isActive: true },
      create: {
        userId,
        channel: body.channel,
        externalId: body.externalId,
        displayName: body.displayName,
        isActive: true,
      },
    });

    return NextResponse.json({
      ok: true,
      data: { text: "Berhasil terhubung! Sekarang kirim transaksi seperti: beli kopi 25 ribu" },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, error: "Pair failed" }, { status: 500 });
  }
}
