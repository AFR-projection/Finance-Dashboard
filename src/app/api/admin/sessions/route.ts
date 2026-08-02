import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-session";
import { clientIp, recordAdminAction } from "@/lib/admin-audit";
import { revokeAccessSession, revokeAllAccessSessions } from "@/lib/access-session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const schema = z.object({
  sessionId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
});

/** Live sessions, newest activity first. Served by the `lastSeenAt` index. */
export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const sessions = await prisma.accessSession.findMany({
    where: { revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    take: 100,
    select: {
      id: true,
      scope: true,
      userAgent: true,
      ip: true,
      country: true,
      city: true,
      lastSeenAt: true,
      createdAt: true,
      expiresAt: true,
      user: { select: { id: true, username: true, name: true, role: true } },
    },
  });

  return NextResponse.json({ ok: true, data: sessions });
}

/** Kills one session, or every session belonging to one account. */
export async function DELETE(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    const body = schema.parse(await request.json());

    if (body.sessionId) {
      if (body.sessionId === admin.sessionId) {
        return NextResponse.json(
          { ok: false, error: "Tidak bisa mencabut sesi yang sedang kamu pakai." },
          { status: 400 },
        );
      }
      const row = await prisma.accessSession.findUnique({
        where: { id: body.sessionId },
        select: { user: { select: { username: true, name: true } } },
      });
      await revokeAccessSession(body.sessionId);
      const who = row?.user.username ? `@${row.user.username}` : row?.user.name || "pengguna";
      await recordAdminAction({
        actor: admin,
        action: "session.revoke",
        summary: `Mencabut satu sesi milik ${who}`,
        targetType: "session",
        targetId: body.sessionId,
        tone: "danger",
        ip: clientIp(request),
      });
      return NextResponse.json({ ok: true });
    }

    if (body.userId) {
      const target = await prisma.user.findUnique({
        where: { id: body.userId },
        select: { username: true, name: true },
      });
      await revokeAllAccessSessions(body.userId);
      const who = target?.username ? `@${target.username}` : target?.name || "pengguna";
      await recordAdminAction({
        actor: admin,
        action: "session.revoke",
        summary: `Mencabut semua sesi milik ${who}`,
        targetType: "user",
        targetId: body.userId,
        tone: "danger",
        ip: clientIp(request),
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Data tidak valid." }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Data tidak valid." }, { status: 400 });
    }
    console.error("[admin/sessions]", error);
    return NextResponse.json({ ok: false, error: "Gagal mencabut sesi." }, { status: 500 });
  }
}
