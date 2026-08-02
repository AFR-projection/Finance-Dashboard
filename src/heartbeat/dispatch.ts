/**
 * Persists a heartbeat analysis and delivers it to every channel the user has.
 *
 * The insight is always saved so the dashboard reflects what the analyst saw;
 * only the interruption is conditional on shouldSend.
 */

import pino from "pino";
import { FinanceEngine } from "@/finance-engine";
import { sendTelegramDocument } from "@/lib/app-config";
import { prisma } from "@/lib/db";
import { notifyLinkedChannels } from "@/lib/notify-channels";
import { sendWebPush } from "@/lib/push";
import type { HeartbeatAnalysis } from "./analyst";

const log = pino({ level: process.env.LOG_LEVEL || "info" });

export function heartbeatMessageText(analysis: HeartbeatAnalysis): string {
  const parts = [analysis.title, "", analysis.body];
  if (analysis.actions.length > 0) {
    parts.push("", ...analysis.actions.map((action) => `• ${action}`));
  }
  return parts.join("\n");
}

export async function dispatchHeartbeat(params: {
  userId: string;
  periodKey: string;
  analysis: HeartbeatAnalysis;
  /** Attached to the Telegram message when a monthly recap is due. */
  attachment?: { filename: string; content: string; caption: string };
}): Promise<{ saved: boolean; telegram: number; push: number; document: boolean }> {
  const { userId, periodKey, analysis, attachment } = params;

  await FinanceEngine.saveAiInsights(userId, periodKey, [
    {
      title: analysis.title,
      body:
        analysis.actions.length > 0
          ? `${analysis.body}\n\n${analysis.actions.map((a) => `• ${a}`).join("\n")}`
          : analysis.body,
      severity: analysis.severity,
    },
  ]);

  // A monthly recap is a deliverable, not an interruption: the spreadsheet goes
  // out even when the analyst judged there was nothing alarming to say.
  const mustSend = analysis.shouldSend || Boolean(attachment);
  if (!mustSend) {
    log.info({ userId, periodKey }, "Heartbeat disimpan tanpa notifikasi (tidak ada yang penting)");
    return { saved: true, telegram: 0, push: 0, document: false };
  }

  const [telegram, push] = await Promise.all([
    notifyLinkedChannels(userId, heartbeatMessageText(analysis)).catch((err) => {
      log.warn({ err, userId }, "Heartbeat Telegram gagal");
      return [] as string[];
    }),
    sendWebPush(userId, {
      title: analysis.title,
      body: analysis.body.slice(0, 240),
      url: "/dashboard/insights",
      tag: `heartbeat:${periodKey}`,
    }).catch((err) => {
      log.warn({ err, userId }, "Heartbeat web push gagal");
      return { sent: 0, removed: 0 };
    }),
  ]);

  let document = false;
  if (attachment) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true },
    });
    if (user?.telegramChatId) {
      const sent = await sendTelegramDocument(
        user.telegramChatId,
        { filename: attachment.filename, content: attachment.content },
        attachment.caption,
      ).catch((err) => {
        log.warn({ err, userId }, "Heartbeat lampiran gagal");
        return { delivered: false };
      });
      document = sent.delivered;
    }
  }

  log.info(
    { userId, periodKey, telegram: telegram.length, push: push.sent, document },
    "Heartbeat terkirim",
  );
  return { saved: true, telegram: telegram.length, push: push.sent, document };
}
