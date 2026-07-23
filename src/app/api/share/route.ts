import { prisma } from "@/lib/db";
import { shareSettingsSchema } from "@/finance-engine/schemas";
import { jsonOk, withApiGuard } from "@/lib/api";

export async function GET(request: Request) {
  return withApiGuard(request, async (userId) => {
    const profile = await prisma.shareProfile.upsert({
      where: { userId },
      update: {},
      create: { userId, visibility: "PRIVATE" },
    });
    return jsonOk(profile);
  });
}

export async function PUT(request: Request) {
  return withApiGuard(request, async (userId) => {
    const body = shareSettingsSchema.parse(await request.json());
    const profile = await prisma.shareProfile.upsert({
      where: { userId },
      update: body,
      create: { userId, ...body },
    });
    return jsonOk(profile);
  });
}
