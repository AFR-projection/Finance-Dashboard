import makeWASocket, {
  DisconnectReason,
  isLidUser,
  jidDecode,
  jidNormalizedUser,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import QRCode from "qrcode";
import pino from "pino";
import { Boom } from "@hapi/boom";
// workers/whatsapp/package.json marks this dir as ESM; @next/env is CJS and
// only exposes its members through the default export under that loader.
import nextEnv from "@next/env";
import fs from "fs";
import path from "path";
import { formatForChannel, splitForChannel } from "../../src/messaging/chat-format";

nextEnv.loadEnvConfig(process.cwd());

const log = pino({ level: process.env.LOG_LEVEL || "info" });
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const WORKER_SECRET = process.env.WHATSAPP_WORKER_SECRET || "";
const AUTH_DIR = process.env.WHATSAPP_AUTH_DIR || path.join(process.cwd(), "workers", ".wa-auth");
const CONFIGURED_OWNER_USER_ID = process.env.WHATSAPP_OWNER_USER_ID || "";
let resolvedOwnerUserId = CONFIGURED_OWNER_USER_ID;

if (!WORKER_SECRET) {
  log.warn("WHATSAPP_WORKER_SECRET is empty - ingress calls will fail auth");
}

async function getOwnerUserId(): Promise<string> {
  if (resolvedOwnerUserId) return resolvedOwnerUserId;
  try {
    const res = await fetch(`${APP_URL}/api/channels/whatsapp-session`, {
      headers: { "x-worker-secret": WORKER_SECRET },
    });
    if (!res.ok) return "";
    const json = (await res.json()) as { data?: { userId?: string } };
    resolvedOwnerUserId = json.data?.userId || "";
    return resolvedOwnerUserId;
  } catch {
    return "";
  }
}

async function syncSession(patch: {
  isConnected?: boolean;
  lastQr?: string | null;
  phoneNumber?: string | null;
  sessionData?: string | null;
}) {
  const ownerUserId = await getOwnerUserId();
  if (!ownerUserId) return;
  try {
    await fetch(`${APP_URL}/api/channels/whatsapp-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-secret": WORKER_SECRET,
      },
      body: JSON.stringify({ userId: ownerUserId, ...patch }),
    });
  } catch (err) {
    log.warn({ err }, "Failed to sync WhatsApp session metadata");
  }
}

async function processMessage(externalId: string, text: string): Promise<string> {
  try {
    const linkMatch = text.match(/^link\s+([a-zA-Z0-9]+)$/i);
    if (linkMatch) {
      const res = await fetch(`${APP_URL}/api/channels`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-worker-secret": WORKER_SECRET,
        },
        body: JSON.stringify({ channel: "WHATSAPP", externalId, code: linkMatch[1] }),
      });
      const json = (await res.json()) as { data?: { text?: string }; error?: string };
      return json.data?.text || json.error || "Gagal pairing.";
    }

    const authMatch = text.match(/^(approve|reject)\s+([a-zA-Z0-9]+)$/i);
    if (authMatch) {
      const action = authMatch[1].toLowerCase();
      const res = await fetch(`${APP_URL}/api/access/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-worker-secret": WORKER_SECRET,
        },
        body: JSON.stringify({ action, code: authMatch[2] }),
      });
      const json = (await res.json()) as { data?: { text?: string }; error?: string };
      return json.data?.text || json.error || "Gagal konfirmasi akses.";
    }

    const res = await fetch(`${APP_URL}/api/channels/ingress`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-secret": WORKER_SECRET,
      },
      body: JSON.stringify({ channel: "WHATSAPP", externalId, message: text }),
      timeout: 60000,
    });
    const json = (await res.json()) as { data?: { text?: string }; error?: string };
    return json.data?.text || json.error || "Maaf, terjadi kesalahan.";
  } catch (err) {
    log.error({ err }, "processMessage failed");
    return "Maaf, terjadi kesalahan koneksi. Coba lagi nanti.";
  }
}

/**
 * Baileys 7 addresses many chats by LID (`123@lid`) rather than by phone
 * number, and that opaque id is not what the owner registered. Resolve it back
 * to the real number so any country/operator can be matched downstream.
 */
async function resolveSenderPhone(sock: WASocket, jid: string): Promise<string> {
  if (isLidUser(jid)) {
    try {
      const pn = await sock.signalRepository.lidMapping.getPNForLID(jidNormalizedUser(jid));
      return pn ? jidDecode(pn)?.user ?? "" : "";
    } catch (err) {
      log.warn({ err, jid }, "LID to phone number lookup failed");
      return "";
    }
  }
  return jidDecode(jid)?.user ?? "";
}

async function startSock(): Promise<WASocket> {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      log.info("Scan QR to connect WhatsApp");
      qrcode.generate(qr, { small: true });
      try {
        const dataUrl = await QRCode.toDataURL(qr);
        await syncSession({ isConnected: false, lastQr: dataUrl });
        fs.writeFileSync(path.join(AUTH_DIR, "last-qr.txt"), dataUrl);
      } catch (err) {
        log.warn({ err }, "QR encode failed");
      }
    }
    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      log.warn({ statusCode, shouldReconnect }, "WhatsApp connection closed");
      await syncSession({ isConnected: false });
      if (shouldReconnect) {
        startSock().catch((err) => log.error(err));
      } else {
        log.error("Logged out - delete auth dir and restart to get a new QR");
      }
    } else if (connection === "open") {
      log.info("WhatsApp connected");
      const phone = sock.user?.id?.replace(/:.*/, "").replace(/@.*/, "") ?? null;
      await syncSession({ isConnected: true, lastQr: null, phoneNumber: phone });
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      const jid = msg.key.remoteJid;
      if (!jid || jid.endsWith("@g.us")) continue;

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        "";

      if (!text.trim() && msg.message?.audioMessage) {
        await sock.sendMessage(jid, {
          text: "Pesan suara terdeteksi. Transkripsi suara akan tersedia di update berikutnya - kirim teks dulu ya.",
        });
        continue;
      }

      if (!text.trim()) continue;

      const phone = await resolveSenderPhone(sock, jid);
      if (!phone) {
        log.warn({ jid }, "Could not resolve sender phone number");
        continue;
      }
      log.info({ phone }, "Incoming WhatsApp message");

      try {
        await sock.sendMessage(jid, { text: "_Ledgerly sedang memproses..._" });
        const reply = await processMessage(phone, text.trim());
        for (const chunk of splitForChannel(formatForChannel(reply, "WHATSAPP"), 3500)) {
          await sock.sendMessage(jid, { text: chunk });
        }
      } catch (error) {
        log.error(error, "Failed processing WhatsApp message");
        await sock.sendMessage(jid, {
          text: "Terjadi error saat memproses pesan. Coba lagi sebentar.",
        });
      }
    }
  });

  return sock;
}

startSock().catch((err) => {
  log.error(err);
  process.exit(1);
});
