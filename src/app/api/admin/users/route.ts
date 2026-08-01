import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/db";
import { revokeAllAccessSessions } from "@/lib/access-session";

const schema = z.object({
  userId: z.string().min(1),
  action: z.enum(["suspend", "activate"]),
});

/**
 * Suspending is the only destructive lever an admin has over an account, and it
 * must be immediate: the status flag alone would leave existing cookies valid
 * for up to 12 hours, so live sessions are revoked in the same call.
 */
export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = schema.parse(await request.json());

    if (body.userId === admin.userId) {
      return NextResponse.json(
        { ok: false, error: "Tidak bisa menangguhkan akun sendiri." },
        { status: 400 },
      );
    }

    const target = await prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, role: true },
    });
    if (!target) {
      return NextResponse.json({ ok: false, error: "Pengguna tidak ditemukan." }, { status: 404 });
    }
    // Admins are peers; letting one lock out another turns a compromised panel
    // into a takeover of the whole platform.
    if (target.role === "ADMIN") {
      return NextResponse.json(
        { ok: false, error: "Akun admin tidak bisa ditangguhkan dari sini." },
        { status: 403 },
      );
    }

    const suspending = body.action === "suspend";
    await prisma.user.update({
      where: { id: body.userId },
      data: { status: suspending ? "SUSPENDED" : "ACTIVE" },
    });
    if (suspending) await revokeAllAccessSessions(body.userId);

    return NextResponse.json({ ok: true, data: { status: suspending ? "SUSPENDED" : "ACTIVE" } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Data tidak valid." }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ ok: false, error: "Gagal memperbarui pengguna." }, { status: 500 });
  }
}
