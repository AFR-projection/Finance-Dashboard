import { Bot, GrammyError, HttpError } from "grammy";
import pino from "pino";

const log = pino({ level: process.env.LOG_LEVEL || "info" });
const token = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const WORKER_SECRET = process.env.WHATSAPP_WORKER_SECRET || "";

if (!token) {
  log.warn("TELEGRAM_BOT_TOKEN kosong — worker idle. Isi di .env lalu redeploy");
  setInterval(() => {}, 60_000);
} else {
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

    const approveMatch = ctx.message.text.match(/^(approve|reject)\s+([a-zA-Z0-9]+)$/i);
    if (approveMatch) {
      await ctx.reply(
        await confirmLogin(approveMatch[1].toLowerCase() as "approve" | "reject", approveMatch[2]),
      );
      return;
    }

    await ctx.replyWithChatAction("typing");
    const reply = await askAgent(id, ctx.message.text);
    if (reply.length > 4000) {
      const chunks = reply.match(/.{1,4000}/gs) ?? [];
      for (const chunk of chunks) {
        await ctx.reply(chunk);
      }
    } else {
      await ctx.reply(reply);
    }
  });

  bot.catch((err) => {
    log.error({ err: err.error }, "Telegram bot error");
    const e = err.error;
    if (e instanceof GrammyError) log.error(e.description);
    else if (e instanceof HttpError) log.error(e);
    else log.error(e);
  });

  bot.start({
    onStart: (info) => log.info(`Telegram bot @${info.username} started`),
  });
}
