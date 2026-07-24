/**
 * Telegram bot worker (Grammy).
 * Idle (no crash) when TELEGRAM_BOT_TOKEN is empty — safe for Docker Compose.
 */
import { Bot, GrammyError, HttpError } from "grammy";
import pino from "pino";

const log = pino({ level: process.env.LOG_LEVEL || "info" });
const token = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const WORKER_SECRET = process.env.WHATSAPP_WORKER_SECRET || "";

if (!token) {
  log.warn("TELEGRAM_BOT_TOKEN kosong — worker idle. Isi di .env lalu ./redeploy.sh");
  setInterval(() => {}, 60_000);
} else {
  const bot = new Bot(token);

  async function askAgent(externalId: string, message: string): Promise<string> {
    const res = await fetch(`${APP_URL}/api/channels/ingress`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-secret": WORKER_SECRET,
      },
      body: JSON.stringify({
        channel: "TELEGRAM",
        externalId,
        message,
      }),
    });
    const json = (await res.json()) as { data?: { text?: string }; error?: string };
    return json.data?.text || json.error || "Maaf, terjadi kesalahan.";
  }

  async function pairAccount(externalId: string, code: string, displayName?: string) {
    const res = await fetch(`${APP_URL}/api/channels`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-worker-secret": WORKER_SECRET,
      },
      body: JSON.stringify({
        channel: "TELEGRAM",
        externalId,
        code,
        displayName,
      }),
    });
    const json = (await res.json()) as { data?: { text?: string }; error?: string };
    return json.data?.text || json.error || "Gagal pairing.";
  }

  async function confirmLogin(action: "approve" | "reject", code: string) {
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
  }

  bot.command("start", async (ctx) => {
    const id = String(ctx.from?.id ?? "");
    await ctx.reply(
      `Halo! Saya Ledgerly AI Finance Agent.\n\nChat ID Anda: ${id}\n\nCara hubungkan akun:\n1. Buka dashboard → Channels\n2. Generate pairing code\n3. Kirim /link KODE\n\nCommands: /help /link /approve /reject /report /balance /expense`,
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "Contoh:\n• beli makan 35 ribu\n• gaji masuk 7 juta\n\n/link KODE\n/approve KODE\n/reject KODE\n/report /balance /expense",
    );
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
    await ctx.reply(await askAgent(String(ctx.from?.id ?? ""), "Buatkan laporan keuangan 30 hari terakhir."));
  });

  bot.command("balance", async (ctx) => {
    await ctx.reply(
      await askAgent(String(ctx.from?.id ?? ""), "Berapa ringkasan saldo, income, dan expense bulan ini?"),
    );
  });

  bot.command("expense", async (ctx) => {
    await ctx.reply(
      await askAgent(String(ctx.from?.id ?? ""), "Analisis pengeluaran saya bulan ini dan kategori terbesar."),
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

    const approveMatch = ctx.message.text.match(/^(approve|reject)\s+([a-zA-Z0-9]+)$/i);
    if (approveMatch) {
      await ctx.reply(await confirmLogin(approveMatch[1].toLowerCase() as "approve" | "reject", approveMatch[2]));
      return;
    }

    await ctx.replyWithChatAction("typing");
    await ctx.reply(await askAgent(id, ctx.message.text));
  });

  bot.catch((err) => {
    log.error(`Error while handling update ${err.ctx.update.update_id}`);
    const e = err.error;
    if (e instanceof GrammyError) log.error(e.description);
    else if (e instanceof HttpError) log.error(e);
    else log.error(e);
  });

  bot.start({
    onStart: (info) => log.info(`Telegram bot @${info.username} started`),
  });
}
