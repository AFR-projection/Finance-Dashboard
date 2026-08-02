import { prisma } from "@/lib/db";

/**
 * The slice of `AppConfig` that public marketing pages are allowed to render.
 *
 * Deliberately a separate reader from `getAppConfigRaw()`: that one hands back
 * the OpenRouter key and the Midtrans server key, and whatever this function
 * returns ends up in HTML served to anonymous visitors.
 */
export type PublicPlan = {
  premiumPriceIdr: number;
  premiumDurationDays: number;
  freeTokenQuota: number;
  premiumTokenQuota: number;
  heartbeatForFree: boolean;
};

/** Mirrors the column defaults in `prisma/schema.prisma`. */
const FALLBACK: PublicPlan = {
  premiumPriceIdr: 20000,
  premiumDurationDays: 30,
  freeTokenQuota: 60000,
  premiumTokenQuota: 1500000,
  heartbeatForFree: false,
};

export async function readPublicPlan(): Promise<PublicPlan> {
  try {
    // `findUnique`, never `upsert`: a page anyone can load must not write.
    const row = await prisma.appConfig.findUnique({
      where: { id: "singleton" },
      select: {
        premiumPriceIdr: true,
        premiumDurationDays: true,
        freeTokenQuota: true,
        premiumTokenQuota: true,
        heartbeatForFree: true,
      },
    });
    return row ?? FALLBACK;
  } catch {
    // The landing page is prerendered, and at build time the database may be
    // unreachable. Marketing copy is not worth failing a deploy over.
    return FALLBACK;
  }
}

export function formatPriceIdr(value: number) {
  if (value <= 0) return "Gratis";
  return `Rp ${value.toLocaleString("id-ID")}`;
}

/** "1,5 juta" reads better than "1.500.000" in a feature bullet. */
export function formatTokens(value: number) {
  if (value <= 0) return "tanpa batas";
  if (value >= 1_000_000) return `${trim(value / 1_000_000)} juta`;
  if (value >= 1_000) return `${trim(value / 1_000)} ribu`;
  return value.toLocaleString("id-ID");
}

function trim(value: number) {
  return value.toFixed(value % 1 === 0 ? 0 : 1).replace(".", ",");
}
