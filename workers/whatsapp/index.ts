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
import { resolveChatCommand } from "../../src/messaging/chat-commands";
import { parseAccessConfirmation } from "../../src/messaging/access-command";
import { walletPromptText, type WalletPrompt } from "../../src/messaging/wallet-choice";

nextEnv.loadEnvConfig(process.cwd());

const log = pino({ level: process.env.LOG_LEVEL || "info" });
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const WORKER_SECRET = process.env.WHATSAPP_WORKER_SECRET || "";
const AUTH_DIR = process.env.WHATSAPP_AUTH_DIR || path.join(process.cwd(), "workers", ".wa-auth");
const CONFIGURED_OWNER_USER_ID = process.env.WHATSAPP_OWNER_USER_ID || "";
/** Baileys closes and reopens often; reconnecting instantly just spins the CPU. */
const RECONNECT_DELAY_MS = 3000;
const CONTROL_POLL_MS = 2000;
const CONNECTED_HEARTBEAT_MS = 5000;
const PAIRING_COMMAND_PREFIX = "PAIR_QR:";
let resolvedOwnerUserId = CONFIGURED_OWNER_USER_ID;
let activeSock: WASocket | null = null;
let restartTimer: ReturnType<typeof setTimeout> | null = null;
let controlPollBusy = false;
let lastHandledPairingCommand = "";
let workerConnected = false;
let connectedPhone: string | null = null;

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

async function getWorkerControl(): Promise<{ userId: string; command: string | null } | null> {
  try {
    const res = await fetch(`${APP_URL}/api/channels/whatsapp-session`, {
      headers: { "x-worker-secret": WORKER_SECRET },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { userId?: string; command?: string | null };
    };
    const userId = json.data?.userId ?? "";
    if (!userId) return null;
    resolvedOwnerUserId = userId;
    return { userId, command: json.data?.command ?? null };
  } catch (err) {
    log.debug({ err }, "Worker control belum bisa dibaca");
    return null;
  }
}

async function syncSession(patch: {
  isConnected?: boolean;
  lastQr?: string | null;
  phoneNumber?: string | null;
  sessionData?: string | null;
}) {
  const ownerUserId = await getOwnerUserId();
  if (!ownerUserId) {
    // Silence here is what makes the dashboard sit on "QR belum tersedia"
    // forever, so say why. Baileys re-emits the QR, so this recovers by itself
    // once the web app is reachable.
    log.warn({ APP_URL }, "Owner belum bisa dibaca dari web; QR tidak bisa ditampilkan di dashboard");
    return;
  }
  try {
    const res = await fetch(`${APP_URL}/api/channels/whatsapp-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-secret": WORKER_SECRET,
      },
      body: JSON.stringify({ userId: ownerUserId, ...patch }),
    });
    if (!res.ok) {
      log.warn({ status: res.status }, "Web menolak sinkronisasi sesi WhatsApp");
    }
  } catch (err) {
    log.warn({ err }, "Failed to sync WhatsApp session metadata");
  }
}

async function askAgent(externalId: string, message: string): Promise<string> {
  const res = await fetch(`${APP_URL}/api/channels/ingress`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-worker-secret": WORKER_SECRET,
    },
    body: JSON.stringify({ channel: "WHATSAPP", externalId, message }),
    timeout: 60000,
  });
  const json = (await res.json()) as {
    data?: { text?: string; walletPrompt?: WalletPrompt };
    error?: string;
  };
  if (!json.data?.text) return json.error || "Maaf, terjadi kesalahan.";

  // WhatsApp has no interactive buttons for personal accounts, so the accounts
  // are offered as a numbered list the user answers in plain text.
  return json.data.walletPrompt
    ? walletPromptText(json.data.walletPrompt)
    : json.data.text;
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

    const confirmation = parseAccessConfirmation(text);
    if (confirmation) {
      const res = await fetch(`${APP_URL}/api/access/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-worker-secret": WORKER_SECRET,
        },
        body: JSON.stringify({ action: confirmation.action, code: confirmation.code }),
      });
      const json = (await res.json()) as { data?: { text?: string }; error?: string };
      return json.data?.text || json.error || "Gagal konfirmasi akses.";
    }

    // WhatsApp shows no command menu, so the same slash commands Telegram
    // registers are matched here by hand.
    const command = resolveChatCommand(text);
    if (command?.kind === "text") return command.text;

    return askAgent(externalId, command?.prompt ?? text);
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

/**
 * A revoked session (unlinking the device from the phone) makes every reconnect
 * fail with 401 and no QR is ever produced again. The stale credentials are
 * moved aside rather than deleted so a mistaken reset can still be undone.
 */
function resetAuthState(reason: "revoked" | "fresh-pairing") {
  const retired = `${AUTH_DIR}.previous`;
  try {
    fs.rmSync(retired, { recursive: true, force: true });
    fs.renameSync(AUTH_DIR, retired);
    log.warn({ retired, reason }, "Kredensial WhatsApp lama dipindahkan");
  } catch (err) {
    log.error({ err, reason }, "Gagal memindahkan kredensial WhatsApp lama");
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

function scheduleStart(delayMs = RECONNECT_DELAY_MS) {
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    startSock().catch((err) => log.error({ err }, "Gagal menyambung WhatsApp"));
  }, delayMs);
}

async function requestFreshPairing(command: string) {
  if (command === lastHandledPairingCommand) return;
  lastHandledPairingCommand = command;
  log.info("Dashboard meminta QR WhatsApp baru");

  const previousSock = activeSock;
  activeSock = null;
  if (previousSock) {
    try {
      previousSock.end(new Error("Fresh pairing requested"));
    } catch {
      // Socket may already be closing; the fresh auth state below is authoritative.
    }
  }

  resetAuthState("fresh-pairing");
  await syncSession({
    isConnected: false,
    lastQr: null,
    phoneNumber: null,
    sessionData: null,
  });
  scheduleStart(250);
}

async function pollWorkerControl() {
  if (controlPollBusy) return;
  controlPollBusy = true;
  try {
    const control = await getWorkerControl();
    if (control?.command?.startsWith(PAIRING_COMMAND_PREFIX)) {
      await requestFreshPairing(control.command);
    }
  } finally {
    controlPollBusy = false;
  }
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
  activeSock = sock;

  sock.ev.on("creds.update", async () => {
    if (activeSock === sock) await saveCreds();
  });

  sock.ev.on("connection.update", async (update) => {
    if (activeSock !== sock) return;
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      log.info("Scan QR to connect WhatsApp");
      qrcode.generate(qr, { small: true });
      try {
        const dataUrl = await QRCode.toDataURL(qr);
        // Written before the sync so a web app that is down cannot cost us the QR.
        fs.writeFileSync(path.join(AUTH_DIR, "last-qr.txt"), dataUrl);
        await syncSession({ isConnected: false, lastQr: dataUrl });
      } catch (err) {
        log.warn({ err }, "QR encode failed");
      }
    }
    if (connection === "close") {
      workerConnected = false;
      connectedPhone = null;
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      log.warn({ statusCode, loggedOut }, "WhatsApp connection closed");
      await syncSession({ isConnected: false, phoneNumber: null, ...(loggedOut ? { lastQr: null } : {}) });

      // Reconnecting with revoked credentials just fails with 401 forever, so
      // clear them first and let the fresh socket emit a new QR.
      activeSock = null;
      if (loggedOut) resetAuthState("revoked");
      scheduleStart();
    } else if (connection === "open") {
      log.info("WhatsApp connected");
      const phone = sock.user?.id?.replace(/:.*/, "").replace(/@.*/, "") ?? null;
      workerConnected = true;
      connectedPhone = phone;
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
  scheduleStart();
});

setInterval(() => {
  void pollWorkerControl();
}, CONTROL_POLL_MS);
void pollWorkerControl();

setInterval(() => {
  if (workerConnected && activeSock) {
    void syncSession({ isConnected: true, lastQr: null, phoneNumber: connectedPhone });
  }
}, CONNECTED_HEARTBEAT_MS);
