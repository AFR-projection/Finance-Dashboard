import type { PlanTier, UsageSource } from "@prisma/client";
import { FinanceEngineError } from "@/finance-engine";
import { getAppConfigRaw } from "@/lib/app-config";
import { prisma } from "@/lib/db";
import { getMonthlyUsage } from "./usage";

export type Entitlement = {
  tier: PlanTier;
  /** 0 means unlimited. */
  quota: number;
  used: number;
  remaining: number;
  periodEnd: Date | null;
};

/**
 * The tier a user actually has right now.
 *
 * Expiry is evaluated on read rather than by a nightly job: a cron that fails
 * silently would leave lapsed accounts on Premium indefinitely, and there is no
 * cheaper moment to check than the request that wants the entitlement.
 */
export async function getEffectiveTier(userId: string): Promise<{
  tier: PlanTier;
  periodEnd: Date | null;
}> {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { tier: true, currentPeriodEnd: true },
  });
  if (!sub) return { tier: "FREE", periodEnd: null };
  const active = sub.currentPeriodEnd.getTime() > Date.now();
  return { tier: active ? sub.tier : "FREE", periodEnd: sub.currentPeriodEnd };
}

export async function getEntitlement(userId: string): Promise<Entitlement> {
  const [{ tier, periodEnd }, cfg, user, usage] = await Promise.all([
    getEffectiveTier(userId),
    getAppConfigRaw(),
    prisma.user.findUnique({ where: { id: userId }, select: { tokenQuotaOverride: true } }),
    getMonthlyUsage(userId, "CHAT"),
  ]);

  const tierQuota = tier === "PREMIUM" ? cfg.premiumTokenQuota : cfg.freeTokenQuota;
  const quota = user?.tokenQuotaOverride ?? tierQuota;

  return {
    tier,
    quota,
    used: usage.tokens,
    remaining: quota === 0 ? Infinity : Math.max(0, quota - usage.tokens),
    periodEnd,
  };
}

/**
 * Gate in front of every LLM call.
 *
 * Checked before the request rather than after, so a user who is already over
 * their allowance cannot spend more of the platform key. The quota is a soft
 * ceiling by design: the final call may overshoot slightly because token counts
 * are only known once the response comes back.
 */
export async function requireAiAccess(userId: string, source: UsageSource): Promise<Entitlement> {
  const entitlement = await getEntitlement(userId);

  if (source === "HEARTBEAT") {
    const cfg = await getAppConfigRaw();
    if (entitlement.tier !== "PREMIUM" && !cfg.heartbeatForFree) {
      throw new FinanceEngineError(
        "Laporan otomatis hanya untuk paket Premium.",
        "UPGRADE_REQUIRED",
        403,
      );
    }
    // Heartbeat runs on the platform's budget, so it is never quota-limited.
    return entitlement;
  }

  if (entitlement.quota > 0 && entitlement.used >= entitlement.quota) {
    throw new FinanceEngineError(
      entitlement.tier === "PREMIUM"
        ? "Kuota AI bulan ini sudah habis. Kuota berikutnya terbuka awal bulan depan."
        : "Kuota AI gratis bulan ini sudah habis. Upgrade ke Premium untuk kuota jauh lebih besar.",
      entitlement.tier === "PREMIUM" ? "QUOTA_EXCEEDED" : "UPGRADE_REQUIRED",
      403,
    );
  }

  return entitlement;
}
