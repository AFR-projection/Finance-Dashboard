import { prisma } from "@/lib/db";
import { isDrasticGeoChange, type GeoInfo } from "@/lib/geo";

export async function evaluateLoginRisk(input: {
  userId: string;
  fingerprintId: string;
  userAgent: string;
  ip: string;
  geo: GeoInfo;
}): Promise<{ requireBot: boolean; reason: string | null }> {
  const device = await prisma.trustedDevice.findUnique({
    where: {
      userId_fingerprintId: {
        userId: input.userId,
        fingerprintId: input.fingerprintId,
      },
    },
  });

  if (!device) {
    return {
      requireBot: true,
      reason: "Perangkat baru terdeteksi — konfirmasi via bot diperlukan.",
    };
  }

  const drastic = isDrasticGeoChange(
    {
      country: device.lastCountry,
      city: device.lastCity,
      lat: null,
      lon: null,
      ip: device.lastIp,
    },
    { ...input.geo, ip: input.ip },
  );

  // Country change on known device still requires bot
  if (device.lastCountry && input.geo.country && device.lastCountry !== input.geo.country) {
    return {
      requireBot: true,
      reason: `Perubahan lokasi drastis (${device.lastCountry} → ${input.geo.country}). Konfirmasi via bot.`,
    };
  }

  if (drastic) {
    return {
      requireBot: true,
      reason: "IP/geo berubah drastis selama login — re-validasi via bot.",
    };
  }

  return { requireBot: false, reason: null };
}

export async function trustDevice(input: {
  userId: string;
  fingerprintId: string;
  userAgent: string;
  ip: string;
  geo: GeoInfo;
}) {
  return prisma.trustedDevice.upsert({
    where: {
      userId_fingerprintId: {
        userId: input.userId,
        fingerprintId: input.fingerprintId,
      },
    },
    update: {
      userAgent: input.userAgent,
      lastIp: input.ip,
      lastCountry: input.geo.country,
      lastCity: input.geo.city,
    },
    create: {
      userId: input.userId,
      fingerprintId: input.fingerprintId,
      userAgent: input.userAgent,
      lastIp: input.ip,
      lastCountry: input.geo.country,
      lastCity: input.geo.city,
    },
  });
}
