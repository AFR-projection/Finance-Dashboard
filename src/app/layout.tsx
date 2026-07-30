import { Instrument_Serif, Manrope } from "next/font/google";
import { Providers } from "@/components/providers";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { Toaster } from "@/components/ui/sonner";
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

export const metadata = {
  title: "Ledgerly — AI Financial OS",
  description: "Personal AI finance assistant with Telegram and a premium dashboard.",
  applicationName: "Ledgerly",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Ledgerly",
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
    <html lang="id" className={`${manrope.variable} ${instrument.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <Providers>
          {children}
          <Toaster />
        </Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
