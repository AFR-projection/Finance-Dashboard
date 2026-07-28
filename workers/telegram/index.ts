import { Bot, GrammyError, HttpError } from "grammy";
import { loadEnvConfig } from "@next/env";
import pino from "pino";
import { prisma } from "../../src/lib/db";
import { parseTelegramAccessConfirmation } from "../../src/messaging/telegram-access-command";
import { formatForChannel, splitForChannel } from "../../src/messaging/chat-format";

loadEnvConfig(process.cwd());

const log = pino({ level: process.env.LOG_LEVEL || "info" });
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const WORKER_SECRET = process.env.WHATSAPP_WORKER_SECRET || "";
const TOKEN_RETRY_MS = 10_000;

async function resolveToken(): Promise<{ token: string; source: "database" | "environment" } | null> {
  try {
    const cfg = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
    const fromDatabase = cfg?.telegramBotToken?.trim();
    if (fromDatabase) return { token: fromDatabase, source: "database" };
  } catch (err) {
    log.warn({ err }, "Belum bisa membaca token Telegram dari database");
  }

  const fromEnv = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return fromEnv ? { token: fromEnv, source: "environment" } : null;
}

async function waitForToken(): Promise<string> {
  let attempt = 0;

  for (;;) {
    const resolved = await resolveToken();
    if (resolved) {
      log.info({ source: resolved.source }, "Token Telegram ditemukan");
      return resolved.token;
    }

    if (attempt === 0 || attempt % 6 === 0) {
      log.warn("Token Telegram belum dikonfigurasi; worker menunggu konfigurasi /setup");
    }
    attempt += 1;
    await new Promise((resolve) => setTimeout(resolve, TOKEN_RETRY_MS));
  }
}

async function main() {
  const token = await waitForToken();
  const bot = new Bot(token);

  async function askAgent(externalId: string, message: string): Promise<string> {
    try {
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
    } catch (err) {
      log.error({ err }, "askAgent failed");
      return "Maaf, terjadi kesalahan koneksi. Coba lagi nanti.";
    }
  }

  async function pairAccount(externalId: string, code: string, displayName?: string) {
    try {
      const res = await fetch(`${APP_URL}/api/channels`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-worker-secret": WORKER_SECRET,
        },
        body: JSON.stringify({ channel: "TELEGRAM", externalId, code, displayName }),
      });
      const json = (await res.json()) as { data?: { text?: string }; error?: string };
      return json.data?.text || json.error || "Gagal pairing.";
    } catch (err) {
      log.error({ err }, "pairAccount failed");
      return "Gagal terhubung ke server. Coba lagi nanti.";
    }
  }

  async function confirmLogin(action: "approve" | "reject", code: string) {
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
      return json.data?.text || json.error || "Gagal memproses konfirmasi akses.";
    } catch (err) {
      log.error({ err }, "confirmLogin failed");
      return "Gagal terhubung ke server. Coba lagi nanti.";
    }
  }

  bot.command("start", async (ctx) => {
    const id = String(ctx.from?.id ?? "");
    await ctx.reply(
      `Halo! Saya *Ledgerly AI Finance Agent*.\n\n` +
        `Chat ID Kamu: \`${id}\`\n\n` +
        `*Cara hubungkan akun:*\n` +
        `1. Buka dashboard web > Channels\n` +
        `2. Generate pairing code\n` +
        `3. Kirim /link KODE\n\n` +
        `*Commands:*\n` +
        `/link KODE — Tautkan akun\n` +
        `/approve KODE — Izinkan akses web\n` +
        `/reject KODE — Tolak akses web\n` +
        `/report — Laporan 30 hari\n` +
        `/balance — Ringkasan bulan ini\n` +
        `/expense — Analisis pengeluaran\n` +
        `/help — Contoh penggunaan\n\n` +
        `Atau kirim pesan biasa seperti: "beli makan 35 ribu"`,
      { parse_mode: "Markdown" },
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "*Contoh Pesan:*\n" +
        "• beli makan 35 ribu\n" +
        "• gaji masuk 7 juta\n" +
        "• cek pengeluaran bulan ini\n" +
        "• buatkan laporan keuangan\n" +
        "• budget makanan 500 ribu\n" +
        "• target nabung 5 juta\n\n" +
        "*Commands:*\n" +
        "/link KODE\n" +
        "/approve KODE\n" +
        "/reject KODE\n" +
        "/report\n" +
        "/balance\n" +
        "/expense",
      { parse_mode: "Markdown" },
    );
  });

  bot.callbackQuery(/^access:(approve|reject):([a-zA-Z0-9]{4,16})$/, async (ctx) => {
    const [, action, code] = ctx.match as unknown as string[];
    const text = await confirmLogin(action as "approve" | "reject", code);
    await ctx.answerCallbackQuery({ text: text.slice(0, 200) });
    // Drop the buttons so the same approval cannot be tapped twice.
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    await ctx.reply(text);
  });

  bot.command("approve", async (ctx) => {
    const code = ctx.match?.trim();
    if (!code) return ctx.reply("Format: /approve KODE");
    await ctx.reply(await confirmLogin("approve", code));
  });

  bot.command("reject", async (ctx) => {
    const code = ctx.match?.trim();
    if (!code) return ctx.reply("Format: /reject KODE");
    await ctx.reply(await confirmLogin("reject", code));
  });

  bot.command("link", async (ctx) => {
    const id = String(ctx.from?.id ?? "");
    const code = ctx.match?.trim();
    if (!code) return ctx.reply("Format: /link KODE");
    const name = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ");
    await ctx.reply(await pairAccount(id, code, name || undefined));
  });

  bot.command("report", async (ctx) => {
    await ctx.replyWithChatAction("typing");
    await ctx.reply(
      await askAgent(String(ctx.from?.id ?? ""), "Buatkan laporan keuangan 30 hari terakhir"),
    );
  });

  bot.command("balance", async (ctx) => {
    await ctx.replyWithChatAction("typing");
    await ctx.reply(
      await askAgent(String(ctx.from?.id ?? ""), "Berapa ringkasan saldo, income, dan expense bulan ini?"),
    );
  });

  bot.command("expense", async (ctx) => {
    await ctx.replyWithChatAction("typing");
    await ctx.reply(
      await askAgent(String(ctx.from?.id ?? ""), "Analisis pengeluaran saya bulan ini dan kategori terbesar"),
    );
  });

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    const id = String(ctx.from?.id ?? "");

    const linkMatch = ctx.message.text.match(/^link\s+([a-zA-Z0-9]+)$/i);
    if (linkMatch) {
      const name = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ");
      await ctx.reply(await pairAccount(id, linkMatch[1], name || undefined));
      return;
    }

    const confirmation = parseTelegramAccessConfirmation(ctx.message.text);
    if (confirmation) {
      await ctx.reply(await confirmLogin(confirmation.action, confirmation.code));
      return;
    }

    await ctx.replyWithChatAction("typing");
    const reply = await askAgent(id, ctx.message.text);
    for (const chunk of splitForChannel(formatForChannel(reply, "TELEGRAM"), 3500)) {
      await ctx.reply(chunk, { parse_mode: "HTML" });
    }
  });

  bot.catch((err) => {
    log.error({ err: err.error }, "Telegram bot error");
    const e = err.error;
    if (e instanceof GrammyError) log.error(e.description);
    else if (e instanceof HttpError) log.error(e);
    else log.error(e);
  });

  // Long polling and webhooks are mutually exclusive. A stale webhook from an
  // earlier deployment otherwise makes the bot appear completely silent.
  await bot.api.deleteWebhook({ drop_pending_updates: false });
  await bot.start({
    onStart: (info) => log.info(`Telegram bot @${info.username} started`),
  });
}

main().catch((err) => {
  log.fatal({ err }, "Telegram worker berhenti");
  process.exitCode = 1;
});
