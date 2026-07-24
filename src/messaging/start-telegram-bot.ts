/**
 * Embedded Telegram bot (approve/reject access + finance NL).
 * Started from server.ts so local `npm run dev` tidak perlu worker terpisah.
 */
import { Bot, GrammyError, HttpError } from "grammy";
import { prisma } from "../lib/db";

async function resolveToken(): Promise<string | null> {
  const fromEnv = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  try {
    const cfg = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
    return cfg?.telegramBotToken?.trim() || null;
  } catch {
    return null;
  }
}

export async function startEmbeddedTelegramBot() {
  if (process.env.TELEGRAM_EMBEDDED === "0") {
    console.log("[telegram] embedded bot disabled (TELEGRAM_EMBEDDED=0)");
    return;
  }

  const token = await resolveToken();
  if (!token) {
    console.warn("[telegram] no token in .env or AppConfig — /approve tidak akan jalan sampai token di-set");
    return;
  }

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000";
  const WORKER_SECRET = process.env.WHATSAPP_WORKER_SECRET || "";

  const bot = new Bot(token);

  async function confirmAccess(action: "approve" | "reject", code: string) {
    const res = await fetch(`${APP_URL}/api/access/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-secret": WORKER_SECRET,
      },
      body: JSON.stringify({ action, code }),
    });
    const json = (await res.json()) as { data?: { text?: string }; error?: string };
    return json.data?.text || json.error || "Gagal memproses.";
  }

  async function askAgent(externalId: string, message: string) {
    const res = await fetch(`${APP_URL}/api/channels/ingress`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-secret": WORKER_SECRET,
      },
      body: JSON.stringify({ channel: "TELEGRAM", externalId, message }),
    });
    const json = (await res.json()) as { data?: { text?: string }; error?: string };
    return json.data?.text || json.error || "Maaf, terjadi kesalahan.";
  }

  bot.command("start", async (ctx) => {
    await ctx.reply(
      `Ledgerly bot aktif.\nChat ID kamu: ${ctx.from?.id}\n\n/approve KODE — izinkan akses web\n/reject KODE — tolak`,
    );
  });

  bot.command("approve", async (ctx) => {
    const code = ctx.match?.trim();
    if (!code) return ctx.reply("Format: /approve KODE");
    await ctx.reply(await confirmAccess("approve", code));
  });

  bot.command("reject", async (ctx) => {
    const code = ctx.match?.trim();
    if (!code) return ctx.reply("Format: /reject KODE");
    await ctx.reply(await confirmAccess("reject", code));
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return;

    const approveMatch = text.match(/^(approve|reject)\s+([a-zA-Z0-9]+)$/i);
    if (approveMatch) {
      await ctx.reply(
        await confirmAccess(approveMatch[1].toLowerCase() as "approve" | "reject", approveMatch[2]),
      );
      return;
    }

    // bare code → treat as approve (owner convenience)
    if (/^[a-fA-F0-9]{6}$/.test(text)) {
      await ctx.reply(await confirmAccess("approve", text));
      return;
    }

    const id = String(ctx.from?.id ?? "");
    await ctx.replyWithChatAction("typing");
    await ctx.reply(await askAgent(id, text));
  });

  bot.catch((err) => {
    const e = err.error;
    if (e instanceof GrammyError) console.error("[telegram]", e.description);
    else if (e instanceof HttpError) console.error("[telegram]", e);
    else console.error("[telegram]", e);
  });

  // Avoid conflict if separate worker also polls same token
  try {
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    bot.start({
      onStart: (info) => console.log(`[telegram] embedded bot @${info.username} listening for /approve`),
    });
  } catch (err) {
    console.error("[telegram] failed to start embedded bot:", err);
  }
}
