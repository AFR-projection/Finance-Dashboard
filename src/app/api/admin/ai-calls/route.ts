import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Tail of the AI request log, for the cost panel's live table. */
export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.aiUsageLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      model: true,
      source: true,
      promptTokens: true,
      outputTokens: true,
      createdAt: true,
      user: { select: { username: true, name: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    data: rows.map((row) => ({
      id: row.id,
      model: row.model,
      source: row.source,
      tokens: row.promptTokens + row.outputTokens,
      user: row.user.username ? `@${row.user.username}` : row.user.name || "—",
      at: row.createdAt.toISOString(),
    })),
  });
}
