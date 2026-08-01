import { createHash } from "crypto";
import { decryptSecret } from "@/lib/crypto";
import { getAppConfigRaw } from "@/lib/app-config";
import { prisma } from "@/lib/db";

export const PREMIUM_DAYS = 30;

export type MidtransKeys = {
  serverKey: string;
  clientKey: string;
  isProduction: boolean;
};

export async function getMidtransKeys(): Promise<MidtransKeys | null> {
  const cfg = await getAppConfigRaw();
  if (!cfg.midtransServerKey || !cfg.midtransClientKey) return null;
  try {
    return {
      serverKey: decryptSecret(cfg.midtransServerKey),
      clientKey: decryptSecret(cfg.midtransClientKey),
      isProduction: cfg.midtransIsProduction,
    };
  } catch {
    return null;
  }
}

export function snapBaseUrl(isProduction: boolean) {
  return isProduction
    ? "https://app.midtrans.com/snap/v1"
    : "https://app.sandbox.midtrans.com/snap/v1";
}

/**
 * Midtrans signs every notification with sha512 over four fields. Skipping this
 * check would let anyone POST a fake "settlement" and grant themselves Premium.
 */
export function verifySignature(input: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  signatureKey: string;
  serverKey: string;
}): boolean {
  const expected = createHash("sha512")
    .update(`${input.orderId}${input.statusCode}${input.grossAmount}${input.serverKey}`)
    .digest("hex");
  // Both are hex digests of fixed length, so a plain compare leaks nothing useful.
  return expected === input.signatureKey.toLowerCase();
}

/**
 * Extends a subscription by 30 days.
 *
 * Paying early must not burn the remaining days, so the new period starts from
 * the later of "now" and the current end date.
 */
export async function grantPremium(userId: string, days = PREMIUM_DAYS) {
  const existing = await prisma.subscription.findUnique({
    where: { userId },
    select: { currentPeriodEnd: true },
  });

  const now = new Date();
  const base =
    existing && existing.currentPeriodEnd.getTime() > now.getTime()
      ? existing.currentPeriodEnd
      : now;
  const currentPeriodEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

  return prisma.subscription.upsert({
    where: { userId },
    update: { tier: "PREMIUM", currentPeriodEnd },
    create: { userId, tier: "PREMIUM", currentPeriodStart: now, currentPeriodEnd },
  });
}

/** `ledgerly-<userId slice>-<timestamp>` keeps it unique and traceable. */
export function newOrderId(userId: string) {
  return `ledgerly-${userId.slice(-8)}-${Date.now()}`;
}
