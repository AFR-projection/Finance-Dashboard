"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  CreditCard,
  KeyRound,
  LogIn,
  ShieldOff,
  Sliders,
  Sparkles,
  UserPlus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AdminEvent } from "@/lib/admin-metrics";
import { EmptyState, relativeTime } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  "user.signup": UserPlus,
  "user.suspend": ShieldOff,
  "user.activate": Sparkles,
  "user.premium": Sparkles,
  "payment.paid": CreditCard,
  "payment.pending": CreditCard,
  "config.update": Sliders,
  "admin.login": LogIn,
  "session.revoke": KeyRound,
  "access.approved": KeyRound,
  "access.rejected": KeyRound,
};

const TONE_CLASS = {
  positive: "bg-brand-glow/15 text-brand-glow",
  neutral: "bg-ink text-ink-muted",
  warning: "bg-amber-400/15 text-amber-200",
  danger: "bg-rose-500/15 text-rose-300",
} as const;

export function ActivityFeed({
  events,
  limit = 12,
  className,
}: {
  events: AdminEvent[];
  limit?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const visible = events.slice(0, limit);

  if (visible.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="Belum ada aktivitas"
        description="Pendaftaran, pembayaran, dan aksi admin akan muncul di sini seketika."
      />
    );
  }

  return (
    <ul className={cn("divide-y divide-ink-border/50", className)}>
      <AnimatePresence initial={false}>
        {visible.map((event) => {
          const Icon = ICONS[event.kind] ?? Activity;
          return (
            <motion.li
              key={event.id}
              layout={!reduced}
              initial={reduced ? false : { opacity: 0, y: -8, height: 0 }}
              animate={reduced ? {} : { opacity: 1, y: 0, height: "auto" }}
              exit={reduced ? {} : { opacity: 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-start gap-3 px-5 py-3"
            >
              <span
                className={cn(
                  "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg",
                  TONE_CLASS[event.tone],
                )}
              >
                <Icon aria-hidden className="size-3.5" strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-ink-foreground">{event.summary}</p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {relativeTime(event.at)}
                  {event.actor ? ` · oleh ${event.actor}` : ""}
                </p>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
