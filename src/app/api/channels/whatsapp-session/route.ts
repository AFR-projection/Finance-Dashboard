import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const schema = z.object({
  userId: z.string().min(1),
  isConnected: z.boolean().optional(),
  lastQr: z.string().nullable().optional(),
  phoneNumber: z.string().nullable().optional(),
  sessionData: z.string().nullable().optional(),
});

/** Internal: WhatsApp worker syncs connection metadata for dashboard QR display */
export async function POST(request: Request) {
  const secret = request.headers.get("x-worker-secret");
  if (!secret || secret !== process.env.WHATSAPP_WORKER_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = schema.parse(await request.json());
    const session = await prisma.whatsAppSession.upsert({
      where: { userId: body.userId },
      update: {
        ...(body.isConnected !== undefined ? { isConnected: body.isConnected } : {}),
        ...(body.lastQr !== undefined ? { lastQr: body.lastQr } : {}),
        ...(body.phoneNumber !== undefined ? { phoneNumber: body.phoneNumber } : {}),
        ...(body.sessionData !== undefined ? { sessionData: body.sessionData } : {}),
      },
      create: {
        userId: body.userId,
        isConnected: body.isConnected ?? false,
        lastQr: body.lastQr ?? null,
        phoneNumber: body.phoneNumber ?? null,
        sessionData: body.sessionData ?? null,
      },
    });
    return NextResponse.json({ ok: true, data: session });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, error: "Session sync failed" }, { status: 500 });
  }
}
