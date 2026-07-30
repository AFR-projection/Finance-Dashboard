import webpush from "web-push";
import pino from "pino";
import { prisma } from "@/lib/db";

const log = pino({ level: process.env.LOG_LEVEL || "info" });

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:owner@example.com",
    publicKey,
    privateKey,
  );
  configured = true;
  return true;
}

/** Best-effort browser push to every device the user has subscribed. */
export async function sendWebPush(userId: string, payload: PushPayload) {
  if (!ensureConfigured()) return { sent: 0, removed: 0 };

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return { sent: 0, removed: 0 };

  const body = JSON.stringify(payload);
  const dead: string[] = [];
  let sent = 0;

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // 404/410 mean the browser dropped the subscription for good.
        if (status === 404 || status === 410) dead.push(sub.id);
        else log.warn({ err: error, endpoint: sub.endpoint }, "web push failed");
      }
    }),
  );

  if (dead.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } });
  }

  return { sent, removed: dead.length };
}
