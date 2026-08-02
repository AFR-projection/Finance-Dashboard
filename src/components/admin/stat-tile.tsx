"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { CountUp } from "@/components/admin/count-up";
import { Sparkline } from "@/components/admin/ink-chart";
import { cn } from "@/lib/utils";

export const revealVariants = {
  hidden: { opacity: 0, y: 16, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)" },
};

export const revealTransition = { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const };

export function StatTile({
  label,
  value,
  icon: Icon,
  format,
  hint,
  delta,
  spark,
  sparkKey,
  accent = "oklch(0.78 0.12 175)",
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  format?: (value: number) => string;
  hint?: string;
  delta?: number;
  spark?: Record<string, unknown>[];
  sparkKey?: string;
  accent?: string;
}) {
  const reduced = useReducedMotion();
  const positive = (delta ?? 0) >= 0;

  return (
    <motion.article
      variants={reduced ? undefined : revealVariants}
      transition={revealTransition}
      className="group relative overflow-hidden rounded-3xl border border-ink-border bg-ink-soft/50 p-5 backdrop-blur-xl"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-30"
        style={{ background: accent }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <span
          className="grid size-9 place-items-center rounded-xl bg-ink"
          style={{ color: accent }}
        >
          <Icon aria-hidden className="size-4" strokeWidth={2.2} />
        </span>
        {delta !== undefined && delta !== 0 && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold",
              positive ? "bg-brand-glow/15 text-brand-glow" : "bg-rose-500/15 text-rose-300",
            )}
          >
            {positive ? (
              <ArrowUpRight aria-hidden className="size-3" strokeWidth={2.6} />
            ) : (
              <ArrowDownRight aria-hidden className="size-3" strokeWidth={2.6} />
            )}
            {Math.abs(delta)}
          </span>
        )}
      </div>

      <p className="tabular-money relative mt-4 text-[1.75rem] font-bold leading-none tracking-[-0.03em] text-ink-foreground">
        <CountUp value={value} format={format} />
      </p>
      <p className="relative mt-1.5 text-sm text-ink-muted">{label}</p>
      {hint && <p className="relative mt-0.5 text-xs text-ink-muted/70">{hint}</p>}

      {spark && sparkKey && (
        <div className="relative mt-3 -mb-1">
          <Sparkline data={spark} dataKey={sparkKey} color={accent} />
        </div>
      )}
    </motion.article>
  );
}

export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? undefined : "hidden"}
      animate={reduced ? undefined : "show"}
      variants={{ show: { transition: { staggerChildren: 0.06 } } }}
      className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}
    >
      {children}
    </motion.div>
  );
}
