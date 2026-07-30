import { Instrument_Serif, Manrope } from "next/font/google";
import { Providers } from "@/components/providers";
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
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
  themeColor: "#f3f7f5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${manrope.variable} ${instrument.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
