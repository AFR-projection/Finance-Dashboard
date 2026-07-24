import { createRequire } from "module";
import { join } from "path";

export type GeoInfo = {
  country: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
};

type GeoIpLite = {
  lookup: (ip: string) => {
    country?: string;
    city?: string;
    ll?: [number, number];
  } | null;
};

let geoip: GeoIpLite | null | undefined;

function loadGeoIp(): GeoIpLite | null {
  if (geoip !== undefined) return geoip;
  try {
    // Load from real node_modules path — Next/Turbopack breaks geoip-lite's __dirname
    const require = createRequire(join(process.cwd(), "package.json"));
    geoip = require("geoip-lite") as GeoIpLite;
  } catch (err) {
    console.warn("geoip-lite unavailable, geo lookup disabled:", err);
    geoip = null;
  }
  return geoip;
}

export function lookupGeo(ip: string): GeoInfo {
  const empty: GeoInfo = { country: null, city: null, lat: null, lon: null };
  try {
    const clean = normalizeIp(ip);
    if (!clean || isPrivateIp(clean)) return empty;

    const lib = loadGeoIp();
    if (!lib) return empty;

    const g = lib.lookup(clean);
    if (!g) return empty;
    return {
      country: g.country ?? null,
      city: g.city ?? null,
      lat: g.ll?.[0] ?? null,
      lon: g.ll?.[1] ?? null,
    };
  } catch (err) {
    console.warn("lookupGeo failed:", err);
    return empty;
  }
}

export function normalizeIp(ip: string): string {
  const first = ip.split(",")[0]?.trim() || ip;
  return first.replace(/^::ffff:/, "");
}

export function getClientIp(headers: Headers, fallback = "127.0.0.1"): string {
  const xf = headers.get("x-forwarded-for");
  const real = headers.get("x-real-ip");
  return normalizeIp(xf || real || fallback);
}

export function isPrivateIp(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  );
}

export function distanceKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function isDrasticGeoChange(
  prev: GeoInfo & { ip?: string | null },
  next: GeoInfo & { ip?: string | null },
  thresholdKm = Number(process.env.LOGIN_GEO_THRESHOLD_KM || 500),
): boolean {
  if (prev.country && next.country && prev.country !== next.country) return true;
  if (
    prev.lat != null &&
    prev.lon != null &&
    next.lat != null &&
    next.lon != null
  ) {
    return (
      distanceKm(
        { lat: prev.lat, lon: prev.lon },
        { lat: next.lat, lon: next.lon },
      ) > thresholdKm
    );
  }
  return false;
}
