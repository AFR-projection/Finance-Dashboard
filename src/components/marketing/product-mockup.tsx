"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bot,
  Check,
  PiggyBank,
  Wallet,
} from "lucide-react";

/**
 * Hand-drawn dashboard mockup for the hero: the story is one message in
 * Telegram (right overlay) landing as a transaction in the dashboard (base).
 * Every number matches on purpose — 32rb kopi shows up in the list, moves the
 * "Jajan" bar, and the wallet balance.
 */

const bars = [
  { label: "Mei", value: 42 },
  { label: "Jun", value: 58 },
  { label: "Jul", value: 47 },
];

const rows = [
  {
    icon: ArrowDownLeft,
    name: "Kopi & roti",
    meta: "Jajan · GoPay",
    amount: "-32.000",
    fresh: true,
  },
  {
    icon: ArrowUpRight,
    name: "Gaji Juli",
    meta: "Pemasukan · BCA",
    amount: "+8.500.000",
    fresh: false,
  },
  {
    icon: ArrowDownLeft,
    name: "Listrik",
    meta: "Tagihan · BCA",
    amount: "-402.000",
    fresh: false,
  },
];

export function ProductMockup() {
  const reduceMotion = useReducedMotion();

  return (
    <div aria-hidden className="relative select-none">
      {/* Base: dashboard card */}
      <div className="mk-card overflow-hidden p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Juli 2026
            </p>
            <p className="tabular-money mt-1 text-2xl font-bold text-foreground">
              Rp 4.318.000
            </p>
            <p className="text-xs text-muted-foreground">sisa uang bulan ini</p>
          </div>
          <span className="grid size-10 place-items-center rounded-2xl bg-secondary text-primary">
            <Wallet className="size-5" strokeWidth={2} />
          </span>
        </div>

        {/* Spend bars */}
        <div className="mt-5 flex items-end gap-3">
          {bars.map((bar, index) => (
            <div key={bar.label} className="flex flex-1 flex-col items-center gap-1.5">
              <motion.div
                initial={reduceMotion ? undefined : { scaleY: 0 }}
                whileInView={reduceMotion ? undefined : { scaleY: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 + index * 0.12, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                style={{ height: `${bar.value}px` }}
                className={`w-full origin-bottom rounded-lg ${
                  index === bars.length - 1 ? "bg-primary" : "bg-primary/25"
                }`}
              />
              <span className="text-[10px] font-semibold text-muted-foreground">{bar.label}</span>
            </div>
          ))}
          <div className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex h-[58px] w-full items-end">
              <div className="w-full rounded-lg border-2 border-dashed border-border" style={{ height: "34px" }} />
            </div>
            <span className="text-[10px] font-semibold text-muted-foreground">Agu</span>
          </div>
        </div>

        {/* Budget pill */}
        <div className="mt-5 rounded-2xl border border-border bg-secondary/50 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-secondary-foreground">
              <PiggyBank className="size-3.5 text-primary" strokeWidth={2.2} />
              Budget Jajan
            </span>
            <span className="tabular-money text-muted-foreground">612rb / 800rb</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
            <motion.div
              initial={reduceMotion ? undefined : { width: "62%" }}
              whileInView={reduceMotion ? undefined : { width: "76%" }}
              viewport={{ once: true }}
              transition={{ delay: 1.5, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="h-full rounded-full bg-primary"
              style={reduceMotion ? { width: "76%" } : undefined}
            />
          </div>
        </div>

        {/* Transactions */}
        <ul className="mt-4 space-y-1.5">
          {rows.map((row, index) => (
            <motion.li
              key={row.name}
              initial={reduceMotion || !row.fresh ? undefined : { opacity: 0, y: -10 }}
              whileInView={reduceMotion || !row.fresh ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 1.35, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className={`flex items-center gap-3 rounded-xl px-2.5 py-2 ${
                row.fresh ? "bg-accent/60" : ""
              }`}
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-lg ${
                  index === 1 ? "bg-emerald-100 text-emerald-700" : "bg-secondary text-primary"
                }`}
              >
                <row.icon className="size-4" strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-foreground">{row.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{row.meta}</p>
              </div>
              <span
                className={`tabular-money text-[13px] font-semibold ${
                  index === 1 ? "text-emerald-700" : "text-foreground"
                }`}
              >
                {row.amount}
              </span>
            </motion.li>
          ))}
        </ul>
      </div>

      {/* Overlay: the Telegram message that caused the fresh row */}
      <motion.div
        initial={reduceMotion ? undefined : { opacity: 0, y: 18, rotate: -1 }}
        whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, rotate: -2 }}
        viewport={{ once: true }}
        transition={{ delay: 0.55, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="absolute -left-3 -top-6 w-[15.5rem] sm:-left-8"
        style={reduceMotion ? { rotate: "-2deg" } : undefined}
      >
        <div className="rounded-2xl border border-border bg-card p-3 shadow-[0_24px_50px_-24px_rgba(15,45,38,.45)]">
          <div className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Bot className="size-3.5" strokeWidth={2.2} />
            </span>
            <span className="text-[11px] font-bold text-foreground">Telegram</span>
          </div>
          <p className="mt-2 rounded-xl rounded-br-sm bg-primary px-3 py-1.5 text-[12px] leading-snug text-primary-foreground">
            kopi sama roti 32rb pake gopay
          </p>
          <motion.p
            initial={reduceMotion ? undefined : { opacity: 0 }}
            whileInView={reduceMotion ? undefined : { opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 1.15, duration: 0.4 }}
            className="mt-1.5 flex items-center gap-1.5 rounded-xl rounded-bl-sm bg-secondary px-3 py-1.5 text-[12px] leading-snug text-secondary-foreground"
          >
            <Check className="size-3 shrink-0 text-primary" strokeWidth={3} />
            Tercatat: Jajan · GoPay
          </motion.p>
        </div>
      </motion.div>
    </div>
  );
}
