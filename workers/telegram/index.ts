import { Bot, GrammyError, HttpError, type Context } from "grammy";
import { loadEnvConfig } from "@next/env";
import pino from "pino";
import { prisma } from "../../src/lib/db";
import { parseAccessConfirmation } from "../../src/messaging/access-command";
import { AGENT_COMMAND_LIST, HELP_TEXT } from "../../src/messaging/chat-commands";
import { formatForChannel, splitForChannel } from "../../src/messaging/chat-format";
import {
  WALLET_CALLBACK_PATTERN,
  parseWalletCallback,
  walletKeyboard,
  type WalletPrompt,
} from "../../src/messaging/wallet-choice";

type AgentReplyPayload = { text: string; walletPrompt?: WalletPrompt };

loadEnvConfig(process.cwd());

const log = pino({ level: process.env.LOG_LEVEL || "info" });
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const WORKER_SECRET = process.env.WORKER_SECRET || "";
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

  async function askAgent(externalId: string, message: string): Promise<AgentReplyPayload> {
    try {
      const res = await fetch(`${APP_URL}/api/channels/ingress`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-worker-secret": WORKER_SECRET,
        },
        body: JSON.stringify({ channel: "TELEGRAM", externalId, message }),
      });
      const json = (await res.json()) as { data?: AgentReplyPayload; error?: string };
      if (json.data?.text) return json.data;
      return { text: json.error || "Maaf, terjadi kesalahan." };
    } catch (err) {
      log.error({ err }, "askAgent failed");
      return { text: "Maaf, terjadi kesalahan koneksi. Coba lagi nanti." };
    }
  }

  async function chooseWallet(
    externalId: string,
    pendingId: string,
    walletId: string | null,
  ): Promise<string> {
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
    } catch (err) {
      log.error({ err }, "chooseWallet failed");
      return "Gagal terhubung ke server. Coba lagi nanti.";
    }
  }

  async function replyAgent(ctx: Context, reply: AgentReplyPayload) {
    const chunks = splitForChannel(formatForChannel(reply.text), 3500);
    for (let i = 0; i < chunks.length; i++) {
      const isLast = i === chunks.length - 1;
      await ctx.reply(chunks[i], {
        parse_mode: "HTML",
        ...(isLast && reply.walletPrompt
          ? { reply_markup: walletKeyboard(reply.walletPrompt) }
          : {}),
      });
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
        `*Chat ID Kamu:*\n\`${id}\`\n\n` +
        `Ketuk angka di atas untuk menyalin, lalu tempel di halaman pendaftaran ` +
        `untuk mengaktifkan akunmu.\n\n` +
        `Sudah punya akun? Kirim pesan biasa seperti:\n` +
        `"beli makan 35 ribu"\n\n` +
        `/help — contoh penggunaan`,
      { parse_mode: "Markdown" },
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(formatForChannel(HELP_TEXT), { parse_mode: "HTML" });
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

  bot.callbackQuery(WALLET_CALLBACK_PATTERN, async (ctx) => {
    const parsed = parseWalletCallback(ctx.callbackQuery.data ?? "");
    if (!parsed) return;
    const text = await chooseWallet(String(ctx.from?.id ?? ""), parsed.pendingId, parsed.walletId);
    await ctx.answerCallbackQuery({ text: text.slice(0, 200) });
    // Drop the buttons so the same draft cannot be recorded twice.
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    await ctx.reply(text);
  });

  for (const { command, prompt } of AGENT_COMMAND_LIST) {
    bot.command(command, async (ctx) => {
      await ctx.replyWithChatAction("typing");
      await replyAgent(ctx, await askAgent(String(ctx.from?.id ?? ""), prompt));
    });
  }

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    const id = String(ctx.from?.id ?? "");

    const linkMatch = ctx.message.text.match(/^link\s+([a-zA-Z0-9]+)$/i);
    if (linkMatch) {
      const name = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ");
      await ctx.reply(await pairAccount(id, linkMatch[1], name || undefined));
      return;
    }

    const confirmation = parseAccessConfirmation(ctx.message.text);
    if (confirmation) {
      await ctx.reply(await confirmLogin(confirmation.action, confirmation.code));
      return;
    }

    await ctx.replyWithChatAction("typing");
    await replyAgent(ctx, await askAgent(id, ctx.message.text));
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
  await bot.api
    .setMyCommands([
      { command: "link", description: "Tautkan akun dengan kode pairing" },
      ...AGENT_COMMAND_LIST.map(({ command, description }) => ({ command, description })),
      { command: "help", description: "Bantuan & contoh pesan" },
    ])
    .catch((err) => log.warn({ err }, "Gagal mendaftarkan menu command"));
  await bot.start({
    onStart: (info) => log.info(`Telegram bot @${info.username} started`),
  });
}

/**
 * A 409 means another instance holds the polling lock — usually the VPS while a
 * laptop is also running, since one token allows exactly one poller. Exiting
 * would leave the bot silent until someone restarts the stack by hand, so we
 * wait for the other side to release the token instead.
 */
const POLL_CONFLICT_RETRY_MS = 30_000;

async function runForever() {
  for (;;) {
    try {
      await main();
      return;
    } catch (err) {
      if (!(err instanceof GrammyError) || err.error_code !== 409) throw err;
      log.warn(
        `Token dipakai instance lain (409). Coba lagi dalam ${POLL_CONFLICT_RETRY_MS / 1000}s — ` +
          `matikan instance lain, atau pakai bot terpisah untuk development.`,
      );
      await new Promise((resolve) => setTimeout(resolve, POLL_CONFLICT_RETRY_MS));
    }
  }
}

runForever().catch((err) => {
  log.fatal({ err }, "Telegram worker berhenti");
  process.exitCode = 1;
});
