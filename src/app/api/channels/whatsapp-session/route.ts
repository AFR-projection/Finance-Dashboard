import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { emitToUser } from "@/lib/socket-server";

const schema = z.object({
  userId: z.string().min(1),
  isConnected: z.boolean().optional(),
  lastQr: z.string().nullable().optional(),
  phoneNumber: z.string().nullable().optional(),
  sessionData: z.string().nullable().optional(),
});

/** Internal: worker discovers the single self-hosted owner after web setup. */
export async function GET(request: Request) {
  const secret = request.headers.get("x-worker-secret");
  if (!secret || secret !== process.env.WHATSAPP_WORKER_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const owner = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!owner) {
    return NextResponse.json({ ok: false, error: "Owner belum setup" }, { status: 404 });
  }
  const session = await prisma.whatsAppSession.findUnique({
    where: { userId: owner.id },
    select: { sessionData: true },
  });
  return NextResponse.json({
    ok: true,
    data: { userId: owner.id, command: session?.sessionData ?? null },
  });
}

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
    emitToUser(body.userId, "whatsapp:session", session);
    return NextResponse.json({ ok: true, data: session });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, error: "Session sync failed" }, { status: 500 });
  }
}
