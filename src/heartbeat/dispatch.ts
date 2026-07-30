/**
 * Persists a heartbeat analysis and delivers it to every channel the user has.
 *
 * The insight is always saved so the dashboard reflects what the analyst saw;
 * only the interruption is conditional on shouldSend.
 */

import pino from "pino";
import { FinanceEngine } from "@/finance-engine";
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
}): Promise<{ saved: boolean; telegram: number; push: number }> {
  const { userId, periodKey, analysis } = params;

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

  if (!analysis.shouldSend) {
    log.info({ userId, periodKey }, "Heartbeat disimpan tanpa notifikasi (tidak ada yang penting)");
    return { saved: true, telegram: 0, push: 0 };
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

  log.info(
    { userId, periodKey, telegram: telegram.length, push: push.sent },
    "Heartbeat terkirim",
  );
  return { saved: true, telegram: telegram.length, push: push.sent };
}
