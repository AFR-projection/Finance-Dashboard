"use client";

import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Bot, TrendingDown } from "lucide-react";

/**
 * The proactive-AI showcase inside the dark band: Ledgerly speaks first.
 * Ink-token colors only — no white/NN text on this surface.
 */
export function InsightShowcase() {
  const reduceMotion = useReducedMotion();

  return (
    <div aria-hidden className="relative mx-auto w-full max-w-md select-none">
      <motion.div
        initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
        whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-3xl border border-ink-border bg-ink-soft/70 p-5 backdrop-blur-xl"
      >
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-brand-glow/15 text-brand-glow">
            <Bot className="size-4.5" strokeWidth={2} />
          </span>
          <div>
            <p className="text-sm font-bold text-ink-foreground">Ledgerly</p>
            <p className="text-[11px] text-ink-muted">laporan mingguan · otomatis</p>
          </div>
          <span className="ml-auto rounded-full border border-ink-border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-glow">
            Premium
          </span>
        </div>

        <div className="mt-4 space-y-2.5">
          <motion.div
            initial={reduceMotion ? undefined : { opacity: 0, x: -14 }}
            whileInView={reduceMotion ? undefined : { opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.35, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="flex gap-3 rounded-2xl border border-ink-border bg-ink/60 p-3.5"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" strokeWidth={2.2} />
            <p className="text-[13px] leading-relaxed text-ink-foreground">
              Budget <b>Jajan</b> sudah 76% padahal baru tanggal 19. Dengan pola sekarang, jebol
              sekitar tanggal 26.
            </p>
          </motion.div>

          <motion.div
            initial={reduceMotion ? undefined : { opacity: 0, x: -14 }}
            whileInView={reduceMotion ? undefined : { opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.6, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="flex gap-3 rounded-2xl border border-ink-border bg-ink/60 p-3.5"
          >
            <TrendingDown className="mt-0.5 size-4 shrink-0 text-brand-glow" strokeWidth={2.2} />
            <p className="text-[13px] leading-relaxed text-ink-foreground">
              Ada 3 langganan yang tidak kepakai bulan ini — total <b>Rp 147.000</b>. Mau
              kutandai buat dievaluasi?
            </p>
          </motion.div>
        </div>

        <motion.p
          initial={reduceMotion ? undefined : { opacity: 0 }}
          whileInView={reduceMotion ? undefined : { opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.9, duration: 0.4 }}
          className="mt-4 text-center text-[11px] uppercase tracking-[0.16em] text-ink-muted"
        >
          dikirim ke Telegram — tanpa kamu minta
        </motion.p>
      </motion.div>

      {/* Glow behind the card */}
      <div className="absolute -inset-8 -z-10 rounded-full bg-[radial-gradient(circle,oklch(0.6_0.13_175/.25),transparent_65%)] blur-2xl" />
    </div>
  );
}
