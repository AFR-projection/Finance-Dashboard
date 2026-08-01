/**
 * Canonical origin for marketing pages & metadata. Falls back to the planned
 * production domain so prerendered SEO artifacts never point at localhost.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://dataku.id"
).replace(/\/$/, "");

export const SITE_NAME = "Ledgerly";
