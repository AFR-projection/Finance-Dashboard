import Link from "next/link";
import { CloudOff } from "lucide-react";

export const metadata = {
  title: "Offline — Ledgerly",
};

export default function OfflinePage() {
  return (
    <div className="vault-shell vault-noise relative flex min-h-svh items-center justify-center overflow-hidden px-6 py-14">
      <div className="relative w-full max-w-sm text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-[1.4rem] border border-white/15 bg-white/[0.07] backdrop-blur-xl">
          <CloudOff className="size-7 text-teal-200" strokeWidth={1.6} />
        </span>

        <h1 className="mt-7 font-[family-name:var(--font-display)] text-[2.2rem] leading-tight text-white">
          Sedang offline
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-white/55">
          Data keuangan hanya dibuka saat terhubung, jadi tidak ada angka basi yang ditampilkan.
          Sambungkan internet lalu muat ulang.
        </p>

        <Link
          href="/dashboard"
          className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-white text-sm font-semibold text-[oklch(0.16_0.03_190)] transition-colors hover:bg-white/90"
        >
          Coba lagi
        </Link>
      </div>
    </div>
  );
}
