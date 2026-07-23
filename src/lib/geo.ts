import geoip from "geoip-lite";

export type GeoInfo = {
  country: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
};

export function lookupGeo(ip: string): GeoInfo {
  const clean = normalizeIp(ip);
  if (!clean || isPrivateIp(clean)) {
    return { country: null, city: null, lat: null, lon: null };
  }
  const g = geoip.lookup(clean);
  if (!g) return { country: null, city: null, lat: null, lon: null };
  return {
    country: g.country ?? null,
    city: g.city ?? null,
    lat: g.ll?.[0] ?? null,
    lon: g.ll?.[1] ?? null,
  };
}

export function normalizeIp(ip: string): string {
  // x-forwarded-for may be "client, proxy"
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

/** Haversine distance in km */
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

/**
 * Drastic IP/geo change = different country OR distance > threshold km.
 */
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
    return distanceKm(
      { lat: prev.lat, lon: prev.lon },
      { lat: next.lat, lon: next.lon },
    ) > thresholdKm;
  }
  // No geo data: treat different public IPs as mild risk (not drastic alone)
  if (prev.ip && next.ip && prev.ip !== next.ip && !isPrivateIp(next.ip)) {
    return false;
  }
  return false;
}
