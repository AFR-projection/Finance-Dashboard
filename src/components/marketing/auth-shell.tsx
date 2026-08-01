"use client";

import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { AuroraScene } from "@/components/motion/aurora-scene";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: React.ReactNode;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-svh flex-col px-5 py-8">
      <AuroraScene withGrid={false} />

      <header className="mobile-safe-top mx-auto w-full max-w-md">
        <Link
          href="/"
          className="inline-flex h-11 items-center gap-2 rounded-xl pr-3 text-sm font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-4" strokeWidth={2.2} />
          Kembali
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
        <div className="flex flex-col items-center text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_18px_40px_-20px_oklch(0.32_0.075_174/.9)]">
            <Sparkles className="size-5" strokeWidth={2} />
          </span>
          <h1 className="mt-6 text-[1.9rem] leading-tight font-bold tracking-[-0.04em] text-foreground sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
        </div>

        <div className="app-surface mt-8 rounded-[1.6rem] p-6 sm:p-7">{children}</div>
      </main>
    </div>
  );
}
