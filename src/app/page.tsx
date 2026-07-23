import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(160deg, oklch(0.28 0.06 165) 0%, oklch(0.35 0.05 145) 45%, oklch(0.42 0.06 95) 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, white 0.5px, transparent 0.6px), radial-gradient(circle at 80% 70%, white 0.5px, transparent 0.6px)",
          backgroundSize: "48px 48px",
        }}
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-12">
        <div className="font-[family-name:var(--font-display)] text-2xl text-white">Ledgerly</div>
        <div className="flex gap-3">
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "text-white hover:bg-white/10 hover:text-white",
            )}
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className={cn(
              buttonVariants(),
              "bg-white text-[oklch(0.28_0.06_165)] hover:bg-white/90",
            )}
          >
            Get started
          </Link>
        </div>
      </header>

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-88px)] max-w-5xl flex-col justify-center px-6 pb-24 pt-10 md:px-12">
        <h1 className="max-w-3xl font-[family-name:var(--font-display)] text-5xl leading-[1.05] text-white md:text-7xl">
          Ledgerly
        </h1>
        <p className="mt-4 max-w-xl text-lg text-white/80 md:text-xl">
          Asisten keuangan pribadi berbasis AI — catat transaksi lewat WhatsApp & Telegram, pantau
          kesehatan finansial di dashboard interaktif.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/register"
            className={cn(
              buttonVariants({ size: "lg" }),
              "bg-white text-[oklch(0.28_0.06_165)] hover:bg-white/90",
            )}
          >
            Mulai gratis
          </Link>
          <Link
            href="/login"
            className={cn(
              buttonVariants({ size: "lg", variant: "outline" }),
              "border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white",
            )}
          >
            Saya sudah punya akun
          </Link>
        </div>
        <p className="mt-10 text-sm text-white/55">
          AI memahami bahasa natural · Finance Engine menjamin akurasi data · Neon PostgreSQL
        </p>
      </section>
    </div>
  );
}
