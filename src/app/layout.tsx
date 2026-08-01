import type { Metadata } from "next";
import { Instrument_Serif, Manrope } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { Toaster } from "@/components/ui/sonner";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
});

const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Catat Keuangan Lewat Chat Telegram`,
    template: `%s · ${SITE_NAME}`,
  },
  description:
    "Aplikasi catat keuangan berbasis AI. Catat pengeluaran cukup lewat chat Telegram, pantau budget dan target tabungan dari dashboard.",
  applicationName: SITE_NAME,
  manifest: "/manifest.webmanifest",
  openGraph: {
    siteName: SITE_NAME,
    locale: "id_ID",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "black-translucent" as const,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1b1c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `scroll-behavior: smooth` in globals.css powers the landing page anchors.
    // Next 16 no longer suppresses it during navigation on its own, so without
    // this attribute every route change would animate its scroll reset.
    <html
      lang="id"
      data-scroll-behavior="smooth"
      className={`${manrope.variable} ${instrument.variable}`}
    >
      <body className="min-h-screen font-sans antialiased">
        {children}
        <Toaster />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
