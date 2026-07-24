import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // geoip-lite needs real filesystem paths for .dat files
  serverExternalPackages: ["geoip-lite", "@prisma/client", "baileys"],
};

export default nextConfig;
