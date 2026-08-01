import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-session";
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Data tidak valid." }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ ok: false, error: "Gagal menyimpan konfigurasi." }, { status: 500 });
  }
}
