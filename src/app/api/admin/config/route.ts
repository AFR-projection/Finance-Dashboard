import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-session";
import { clientIp, recordAdminAction } from "@/lib/admin-audit";
import { getAppConfigRaw } from "@/lib/app-config";
import { encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";

const schema = z.object({
  aiModel: z.string().min(1).max(120).optional(),
  aiFallbackModels: z.string().max(400).optional(),
  openrouterApiKey: z.string().min(10).max(500).optional(),
  freeTokenQuota: z.number().int().min(0).max(100_000_000).optional(),
  premiumTokenQuota: z.number().int().min(0).max(100_000_000).optional(),
  premiumPriceIdr: z.number().int().min(0).max(100_000_000).optional(),
  premiumDurationDays: z.number().int().min(1).max(3650).optional(),
  heartbeatForFree: z.boolean().optional(),
  midtransServerKey: z.string().min(10).max(500).optional(),
  midtransClientKey: z.string().min(10).max(500).optional(),
  midtransIsProduction: z.boolean().optional(),
});

/** Platform AI + billing config. Secrets are write-only: never echoed back. */
export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = schema.parse(await request.json());
    const data: Record<string, unknown> = {};

    if (body.aiModel !== undefined) data.aiModel = body.aiModel.trim();
    if (body.aiFallbackModels !== undefined) {
      data.aiFallbackModels = body.aiFallbackModels.trim() || null;
    }
    if (body.freeTokenQuota !== undefined) data.freeTokenQuota = body.freeTokenQuota;
    if (body.premiumTokenQuota !== undefined) data.premiumTokenQuota = body.premiumTokenQuota;
    if (body.premiumPriceIdr !== undefined) data.premiumPriceIdr = body.premiumPriceIdr;
    if (body.premiumDurationDays !== undefined) {
      data.premiumDurationDays = body.premiumDurationDays;
    }
    if (body.heartbeatForFree !== undefined) data.heartbeatForFree = body.heartbeatForFree;
    if (body.midtransIsProduction !== undefined) {
      data.midtransIsProduction = body.midtransIsProduction;
    }

    // Encrypted at rest with the same helper the rest of the app uses.
    if (body.openrouterApiKey) data.openrouterApiKey = encryptSecret(body.openrouterApiKey);
    if (body.midtransServerKey) data.midtransServerKey = encryptSecret(body.midtransServerKey);
    if (body.midtransClientKey) data.midtransClientKey = encryptSecret(body.midtransClientKey);

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: false, error: "Tidak ada perubahan." }, { status: 400 });
    }

    await getAppConfigRaw();
    await prisma.appConfig.update({ where: { id: "singleton" }, data });

    // The landing page prices the plans from this row, and it is prerendered.
    // Without this, a price change would sit invisible until the 5-minute
    // window rolled over.
    if (
      body.premiumPriceIdr !== undefined ||
      body.premiumDurationDays !== undefined ||
      body.freeTokenQuota !== undefined ||
      body.premiumTokenQuota !== undefined ||
      body.heartbeatForFree !== undefined
    ) {
      revalidatePath("/");
    }

    // Secret values must never reach the audit trail — only the field names do.
    await recordAdminAction({
      actor: admin,
      action: "config.update",
      summary: `Mengubah konfigurasi: ${Object.keys(data).join(", ")}`,
      targetType: "config",
      targetId: "singleton",
      meta: { fields: Object.keys(data) },
      tone: "warning",
      ip: clientIp(request),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Menyebut field yang ditolak. Tanpa ini pesannya cuma "Data tidak valid."
      // dan admin tidak punya cara tahu isian mana yang salah.
      const fields = [...new Set(error.issues.map((issue) => issue.path.join(".")))];
      return NextResponse.json(
        { ok: false, error: `Nilai tidak valid pada: ${fields.join(", ")}` },
        { status: 400 },
      );
    }
    console.error(error);
    return NextResponse.json({ ok: false, error: "Gagal menyimpan konfigurasi." }, { status: 500 });
  }
}
