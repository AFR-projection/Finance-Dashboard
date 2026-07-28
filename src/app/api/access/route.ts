import { z } from "zod";
import { getClientIp, lookupGeo } from "@/lib/geo";
import { getAppConfig, notifyOwner } from "@/lib/app-config";
import {
  accessTtlSeconds,
  newAccessIds,
  createAccessChallenge,
  getAccessChallenge,
  purgeExpiredAccessChallenges,
} from "@/lib/access-challenge";
import { logSuspiciousLogin } from "@/lib/security-log";
import { rateLimit } from "@/lib/rate-limit";

const startSchema = z.object({
  fingerprintId: z.string().min(8).max(128),
});

/** Start access challenge → notify owner bot */
export async function POST(request: Request) {
  const cfg = await getAppConfig();
  if (!cfg.isReady) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "SETUP_REQUIRED",
          message: "Owner/bot belum dikonfigurasi. Buka /setup dulu.",
        },
      },
      { status: 503 },
    );
  }

  const ip = getClientIp(request.headers);
  const rl = rateLimit(`access-start:${ip}`, 15);
  if (!rl.ok) {
    return Response.json(
      { ok: false, error: { code: "RATE_LIMITED", message: "Terlalu banyak percobaan" } },
      { status: 429 },
    );
  }

  const body = startSchema.parse(await request.json());
  const geo = lookupGeo(ip);
  const ua = request.headers.get("user-agent") || "unknown";
  const { sessionId, confirmCode } = newAccessIds();

  await purgeExpiredAccessChallenges();
  await createAccessChallenge({
    sessionId,
    confirmCode,
    fingerprintId: body.fingerprintId,
    userAgent: ua,
    ip,
    country: geo.country,
    city: geo.city,
  });

  const msg =
    `🔐 Permintaan akses Ledgerly\n\n` +
    `Kode: ${confirmCode}\n` +
    `IP: ${ip}${geo.city || geo.country ? ` (${[geo.city, geo.country].filter(Boolean).join(", ")})` : ""}\n` +
    `Perangkat: ${ua.slice(0, 120)}\n` +
    `Fingerprint: ${body.fingerprintId.slice(0, 12)}…\n\n` +
    `Tekan tombol di bawah, atau balas: /approve ${confirmCode}\n` +
    `Berlaku ~${Math.round(accessTtlSeconds() / 60)} menit.`;

  const notified = await notifyOwner(msg, {
    approveCode: confirmCode,
  });
  logSuspiciousLogin({
    type: "access_requested",
    ip,
    fingerprintId: body.fingerprintId,
    country: geo.country,
    reason: notified.channel,
  });

  return Response.json({
    ok: true,
    data: {
      sessionId,
      // Telegram gets tap-to-approve buttons, so the code never needs to reach
      // the browser. WhatsApp has no buttons — the owner must read it and reply.
      confirmCode: notified.channel === "WHATSAPP" ? confirmCode : null,
      ttlSeconds: accessTtlSeconds(),
      notifiedVia: notified.channel,
      message:
        notified.channel === "TELEGRAM"
          ? "Notifikasi terkirim ke Telegram owner. Tekan Izinkan di bot…"
          : "Balas di WhatsApp bot: approve KODE (atau reject KODE).",
    },
  });
}

/** Poll status */
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) {
    return Response.json({ ok: false, error: "sessionId required" }, { status: 400 });
  }
  const c = await getAccessChallenge(sessionId);
  if (!c) return Response.json({ ok: true, data: { status: "expired" } });
  return Response.json({
    ok: true,
    data: { status: c.status },
  });
}
