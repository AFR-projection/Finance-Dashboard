import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-session";
import { clientIp, recordAdminAction } from "@/lib/admin-audit";
import { sendTelegramMessage } from "@/lib/app-config";
import { prisma } from "@/lib/db";
import { grantPremium, premiumDurationDays } from "@/lib/midtrans";

const schema = z.object({
  userId: z.string().min(1),
  days: z.number().int().min(1).max(3650).optional(),
});

/**
 * Manual activation for payments that arrived outside Midtrans (bank transfer,
 * promo, apology). Written to the same table with a `manual_` order id so the
 * payments history stays a single source of truth.
 */
export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = schema.parse(await request.json());
    // Tanpa `days` eksplisit, ikuti masa aktif yang disetel di panel Paket.
    const days = body.days ?? (await premiumDurationDays());

    const user = await prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, username: true, name: true, telegramChatId: true },
    });
    if (!user) {
      return NextResponse.json({ ok: false, error: "Pengguna tidak ditemukan." }, { status: 404 });
    }

    const sub = await grantPremium(user.id, days);

    await prisma.payment.create({
      data: {
        userId: user.id,
        orderId: `manual_${user.id.slice(-8)}_${Date.now()}`,
        grossAmount: 0,
        status: "settlement",
        paidAt: new Date(),
        raw: { manual: true, byAdmin: admin.userId, days },
      },
    });

    if (user.telegramChatId) {
      await sendTelegramMessage(
        user.telegramChatId,
        `🎉 Premium aktif sampai ${sub.currentPeriodEnd.toLocaleDateString("id-ID", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}.`,
      );
    }

    const who = user.username ? `@${user.username}` : user.name || "pengguna";
    await recordAdminAction({
      actor: admin,
      action: "user.premium",
      summary: `Mengaktifkan Premium ${days} hari untuk ${who}`,
      targetType: "user",
      targetId: user.id,
      meta: { days, until: sub.currentPeriodEnd.toISOString() },
      tone: "positive",
      ip: clientIp(request),
    });

    return NextResponse.json({ ok: true, data: { until: sub.currentPeriodEnd } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Data tidak valid." }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ ok: false, error: "Gagal mengaktifkan." }, { status: 500 });
  }
}
