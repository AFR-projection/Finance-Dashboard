"use client";

import FingerprintJS from "@fingerprintjs/fingerprintjs";

let cached: string | null = null;

export async function getBrowserFingerprint(): Promise<string> {
  if (cached) return cached;
  try {
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    cached = result.visitorId;
    return cached;
  } catch {
    // Fallback deterministic-enough from UA (not as strong)
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
    cached = `fallback_${btoa(ua).slice(0, 24)}`;
    return cached;
  }
}
