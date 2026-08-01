import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ledgerly — AI Financial OS",
    short_name: "Ledgerly",
    description: "Asisten keuangan pribadi bertenaga AI dengan dashboard dan bot Telegram.",
    lang: "id",
    // Relative so the PWA installs against whichever host served it — the
    // dashboard lives on app.<domain> in production but on the apex in dev.
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0d1b1c",
    theme_color: "#f3f7f5",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-192-maskable.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Tanya AI", short_name: "AI", url: "/dashboard/agent" },
      { name: "Transaksi", short_name: "Transaksi", url: "/dashboard/transactions" },
      { name: "Insight", short_name: "Insight", url: "/dashboard/insights" },
    ],
  };
}
