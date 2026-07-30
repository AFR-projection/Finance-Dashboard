import { z } from "zod";
import { getAppConfig, bootstrapApp } from "@/lib/app-config";
import { jsonOk } from "@/lib/api";

export async function GET() {
  const cfg = await getAppConfig();
  return jsonOk({
    setupCompleted: cfg.setupCompleted,
    isReady: cfg.isReady,
    // never expose tokens
    hasTelegram: cfg.hasTelegram,
    ownerName: cfg.ownerName,
  });
}

const schema = z.object({
  ownerName: z.string().min(2).max(80),
  telegramBotToken: z.string().min(20),
  telegramOwnerChatId: z.string().min(3),
});

export async function POST(request: Request) {
  try {
    const cfg = await getAppConfig();
    if (cfg.setupCompleted) {
      return Response.json(
        { ok: false, error: { code: "DONE", message: "Setup sudah selesai. Gunakan Settings." } },
        { status: 400 },
      );
    }

    const body = schema.parse(await request.json());
    const result = await bootstrapApp({
      ownerName: body.ownerName,
      telegramBotToken: body.telegramBotToken,
      telegramOwnerChatId: body.telegramOwnerChatId,
    });

    return jsonOk(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Setup gagal";
    return Response.json(
      { ok: false, error: { code: "SETUP", message } },
      { status: 400 },
    );
  }
}
