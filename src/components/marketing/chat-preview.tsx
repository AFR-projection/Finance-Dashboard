"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Bot, Check, Sparkles } from "lucide-react";

const script = [
  { from: "user", text: "kopi sama roti 32rb pake gopay" },
  { from: "bot", text: "Tercatat. Makanan & Minuman · GoPay" },
  { from: "user", text: "bulan ini jajan berapa?" },
  { from: "bot", text: "Rp 1.240.000 — naik 18% dari Juni." },
];

export function ChatPreview() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative">
      <div className="app-surface relative overflow-hidden rounded-[1.6rem] p-4 sm:p-5">
        <div className="flex items-center gap-2.5 border-b border-border/70 pb-3">
          <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Bot className="size-4" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">Ledgerly</p>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              online
            </p>
          </div>
          <Sparkles className="ml-auto size-4 text-accent-foreground" strokeWidth={2} />
        </div>

        <ul className="mt-4 space-y-2.5">
          {script.map((line, index) => (
            <motion.li
              key={line.text}
              initial={reduceMotion ? undefined : { opacity: 0, y: 12, scale: 0.97 }}
              whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{
                delay: 0.35 + index * 0.45,
                duration: 0.45,
                ease: [0.22, 1, 0.36, 1],
              }}
              className={line.from === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <span
                className={
                  line.from === "user"
                    ? "max-w-[80%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground"
                    : "max-w-[85%] rounded-2xl rounded-bl-md border border-border/70 bg-secondary px-3.5 py-2 text-sm text-secondary-foreground"
                }
              >
                {line.text}
              </span>
            </motion.li>
          ))}
        </ul>

        <motion.div
          initial={reduceMotion ? undefined : { opacity: 0, y: 10 }}
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 2.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-600/25 bg-emerald-50/80 px-3.5 py-3"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white">
            <Check className="size-4" strokeWidth={2.5} />
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-emerald-900">Masuk ke dashboard</p>
            <p className="text-[13px] text-emerald-800/80">
              Saldo GoPay &amp; budget jajan ikut ter-update
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
