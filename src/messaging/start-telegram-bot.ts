import { Bot, GrammyError, HttpError } from "grammy";
import { prisma } from "../lib/db";
import { parseTelegramAccessConfirmation } from "./telegram-access-command";
import {
  WALLET_CALLBACK_PATTERN,
  parseWalletCallback,
  walletKeyboard,
  type WalletPrompt,
} from "./wallet-prompt";

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
    console.warn("[telegram] no token in .env or AppConfig - /approve tidak akan jalan sampai token di-set");
    return;
  }

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000";
  const WORKER_SECRET = process.env.WHATSAPP_WORKER_SECRET || "";

  const bot = new Bot(token);

  async function confirmAccess(action: "approve" | "reject", code: string) {
    try {
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
    } catch {
      return "Gagal terhubung ke server. Coba lagi nanti.";
    }
  }

  async function askAgent(externalId: string, message: string) {
    try {
      const res = await fetch(`${APP_URL}/api/channels/ingress`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-worker-secret": WORKER_SECRET,
        },
        body: JSON.stringify({ channel: "TELEGRAM", externalId, message }),
      });
      const json = (await res.json()) as {
        data?: { text?: string; walletPrompt?: WalletPrompt };
        error?: string;
      };
      if (json.data?.text) return { text: json.data.text, walletPrompt: json.data.walletPrompt };
      return { text: json.error || "Maaf, terjadi kesalahan." };
    } catch {
      return { text: "Maaf, terjadi kesalahan koneksi. Coba lagi nanti." };
    }
  }

  async function chooseWallet(externalId: string, pendingId: string, walletId: string | null) {
    try {
      const res = await fetch(`${APP_URL}/api/channels/wallet-choice`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-worker-secret": WORKER_SECRET,
        },
        body: JSON.stringify({
          channel: "TELEGRAM",
          externalId,
          pendingId,
          walletId: walletId ?? undefined,
          action: walletId ? "confirm" : "cancel",
        }),
      });
      const json = (await res.json()) as { data?: { text?: string }; error?: string };
      return json.data?.text || json.error || "Gagal mencatat transaksi.";
    } catch {
      return "Gagal terhubung ke server. Coba lagi nanti.";
    }
  }

  bot.command("start", async (ctx) => {
    await ctx.reply(
      `Ledgerly bot aktif.\nChat ID kamu: ${ctx.from?.id}\n\n` +
        `/approve KODE - izinkan akses web\n/reject KODE - tolak\n\n` +
        `Atau kirim pesan biasa seperti "beli makan 35 ribu"`,
    );
  });

  bot.callbackQuery(/^access:(approve|reject):([a-zA-Z0-9]{4,16})$/, async (ctx) => {
    const [, action, code] = ctx.match as unknown as string[];
    const text = await confirmAccess(action as "approve" | "reject", code);
    await ctx.answerCallbackQuery({ text: text.slice(0, 200) });
    // Drop the buttons so the same approval cannot be tapped twice.
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    await ctx.reply(text);
  });

  bot.callbackQuery(WALLET_CALLBACK_PATTERN, async (ctx) => {
    const parsed = parseWalletCallback(ctx.callbackQuery.data ?? "");
    if (!parsed) return;
    const text = await chooseWallet(String(ctx.from?.id ?? ""), parsed.pendingId, parsed.walletId);
    await ctx.answerCallbackQuery({ text: text.slice(0, 200) });
    // Drop the buttons so the same draft cannot be recorded twice.
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    await ctx.reply(text);
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

    const confirmation = parseTelegramAccessConfirmation(text);
    if (confirmation) {
      await ctx.reply(await confirmAccess(confirmation.action, confirmation.code));
      return;
    }

    const id = String(ctx.from?.id ?? "");
    await ctx.replyWithChatAction("typing");
    const reply = await askAgent(id, text);
    await ctx.reply(
      reply.text,
      reply.walletPrompt ? { reply_markup: walletKeyboard(reply.walletPrompt) } : {},
    );
  });

  bot.catch((err) => {
    const e = err.error;
    if (e instanceof GrammyError) console.error("[telegram]", e.description);
    else if (e instanceof HttpError) console.error("[telegram]", e);
    else console.error("[telegram]", e);
  });

  try {
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    await bot.start({
      onStart: (info) => console.log(`[telegram] embedded bot @${info.username} listening`),
    });
  } catch (err) {
    if (err instanceof GrammyError && err.error_code === 409) {
      console.error(
        "[telegram] polling conflict: token ini sedang dipakai instance lain. " +
          "Hentikan worker lain atau set TELEGRAM_EMBEDDED=0.",
      );
      return;
    }
    console.error("[telegram] failed to start embedded bot:", err);
  }
}
