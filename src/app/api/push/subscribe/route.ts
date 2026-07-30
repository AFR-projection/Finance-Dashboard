import { FinanceEngineError } from "@/finance-engine";
import { jsonOk, withApiGuard } from "@/lib/api";
import { prisma } from "@/lib/db";

type SubscribeBody = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

export async function POST(request: Request) {
  return withApiGuard(request, async (userId) => {
    const body = (await request.json().catch(() => ({}))) as SubscribeBody;
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : "";
    const auth = typeof body.keys?.auth === "string" ? body.keys.auth : "";

    if (!endpoint || !p256dh || !auth) {
      throw new FinanceEngineError("Subscription tidak lengkap", "INVALID_SUBSCRIPTION", 400);
    }

    const record = await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId,
        endpoint,
        p256dh,
        auth,
        userAgent: request.headers.get("user-agent")?.slice(0, 255) ?? null,
      },
      update: { userId, p256dh, auth },
    });

    return jsonOk({ id: record.id });
  });
}

export async function DELETE(request: Request) {
  return withApiGuard(request, async (userId) => {
    const body = (await request.json().catch(() => ({}))) as SubscribeBody;
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";

    if (!endpoint) {
      throw new FinanceEngineError("Endpoint wajib diisi", "INVALID_SUBSCRIPTION", 400);
    }

    const result = await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return jsonOk({ removed: result.count });
  });
}
