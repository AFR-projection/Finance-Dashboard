import type { UsageSource } from "@prisma/client";
import { prisma } from "@/lib/db";

export type TokenUsage = { promptTokens: number; outputTokens: number };

/** Month bucket in UTC, matching how the rest of the app treats calendar days. */
export function currentPeriodKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Records what an AI call actually cost.
 *
 * The aggregate is what quota checks read; the log exists so an admin can see
 * which model burned the platform key. Failing to record must never break the
 * user's reply — they already got their answer, and the tokens are spent either
 * way — so errors are swallowed after logging.
 */
export async function recordAiUsage(input: {
  userId: string;
  source: UsageSource;
  model: string;
  usage: TokenUsage;
}) {
  const tokens = Math.max(0, input.usage.promptTokens + input.usage.outputTokens);
  if (tokens === 0) return;

  const periodKey = currentPeriodKey();
  try {
    await prisma.$transaction([
      prisma.aiUsageMonthly.upsert({
        where: {
          userId_periodKey_source: { userId: input.userId, periodKey, source: input.source },
        },
        update: { tokens: { increment: tokens }, requests: { increment: 1 } },
        create: {
          userId: input.userId,
          periodKey,
          source: input.source,
          tokens,
          requests: 1,
        },
      }),
      prisma.aiUsageLog.create({
        data: {
          userId: input.userId,
          source: input.source,
          model: input.model,
          promptTokens: input.usage.promptTokens,
          outputTokens: input.usage.outputTokens,
        },
      }),
    ]);
  } catch (error) {
    console.error("[usage] gagal mencatat pemakaian token", error);
  }
}

export async function getMonthlyUsage(userId: string, source: UsageSource) {
  const row = await prisma.aiUsageMonthly.findUnique({
    where: { userId_periodKey_source: { userId, periodKey: currentPeriodKey(), source } },
    select: { tokens: true, requests: true },
  });
  return { tokens: row?.tokens ?? 0, requests: row?.requests ?? 0 };
}
