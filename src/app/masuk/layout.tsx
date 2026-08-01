import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Masuk",
  description:
    "Masuk ke Ledgerly dengan username. Konfirmasi dikirim ke Telegram kamu sendiri — tanpa password.",
  alternates: { canonical: "/masuk" },
  robots: { index: false },
};

export default function MasukLayout({ children }: { children: React.ReactNode }) {
  return children;
}
