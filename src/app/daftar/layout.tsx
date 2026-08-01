import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Daftar Gratis",
  description:
    "Buat akun Ledgerly dalam 30 detik. Cukup pilih username lalu tekan Start di bot Telegram — tanpa email, tanpa password, tanpa kartu kredit.",
  alternates: { canonical: "/daftar" },
  openGraph: {
    title: "Daftar Ledgerly — aktif dalam 30 detik",
    description: "Pilih username, tekan Start di Telegram, selesai. Gratis tanpa kartu kredit.",
    url: "/daftar",
  },
};

export default function DaftarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
