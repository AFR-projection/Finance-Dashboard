import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* Primitives for the ink-surfaced admin console.
 *
 * These lift the class strings that the panel had already converged on into one
 * place, so a new page cannot drift from the ones written before it. */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-glow">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1.5 text-2xl font-bold tracking-[-0.03em] text-ink-foreground sm:text-[1.75rem]">
          {title}
        </h1>
        {description && <p className="mt-2 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  className,
  children,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "rounded-3xl border border-ink-border bg-ink-soft/50 backdrop-blur-xl",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  hint,
  icon: Icon,
  actions,
}: {
  title: string;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-border/70 px-5 py-4">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && (
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-ink text-brand-glow">
            <Icon aria-hidden className="size-4" strokeWidth={2.2} />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold tracking-[-0.01em] text-ink-foreground">
            {title}
          </h2>
          {hint && <p className="truncate text-xs text-ink-muted">{hint}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

const TONES = {
  positive: "bg-brand-glow/15 text-brand-glow",
  neutral: "bg-ink text-ink-muted",
  warning: "bg-amber-400/15 text-amber-200",
  danger: "bg-rose-500/15 text-rose-300",
  info: "bg-sky-400/15 text-sky-200",
} as const;

export type ToneName = keyof typeof TONES;

export function Tone({
  tone = "neutral",
  className,
  children,
}: {
  tone?: ToneName;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Pulsing dot. `live` off renders the same footprint so nothing shifts. */
export function LiveDot({ live = true, className }: { live?: boolean; className?: string }) {
  return (
    <span className={cn("relative flex size-2", className)}>
      {live && (
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-glow/70 motion-reduce:hidden" />
      )}
      <span
        className={cn(
          "relative inline-flex size-2 rounded-full",
          live ? "bg-brand-glow" : "bg-ink-muted/50",
        )}
      />
    </span>
  );
}

export function InkTable({
  head,
  children,
  minWidth = "44rem",
  caption,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  minWidth?: string;
  caption: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-ink-border text-left text-[11px] uppercase tracking-[0.14em] text-ink-muted">
            {head}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Th({
  className,
  children,
  ...props
}: React.ComponentProps<"th">) {
  return (
    <th scope="col" className={cn("px-5 py-3.5 font-bold", className)} {...props}>
      {children}
    </th>
  );
}

export function Td({ className, children, ...props }: React.ComponentProps<"td">) {
  return (
    <td className={cn("px-5 py-3.5 align-middle", className)} {...props}>
      {children}
    </td>
  );
}

export function Tr({ className, children, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-b border-ink-border/60 transition-colors last:border-0 hover:bg-ink/40",
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-12 text-center text-sm text-ink-muted">
        {children}
      </td>
    </tr>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center px-5 py-14 text-center">
      {Icon && (
        <span className="grid size-11 place-items-center rounded-2xl bg-ink text-ink-muted">
          <Icon aria-hidden className="size-5" strokeWidth={1.8} />
        </span>
      )}
      <p className="mt-4 text-sm font-semibold text-ink-foreground">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm text-ink-muted">{description}</p>}
    </div>
  );
}

/** Thin proportion bar — quota consumed, share of spend, and similar. */
export function MiniBar({
  value,
  max,
  tone = "positive",
  className,
}: {
  value: number;
  max: number;
  tone?: "positive" | "warning" | "danger";
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const fill =
    tone === "danger" ? "bg-rose-400" : tone === "warning" ? "bg-amber-300" : "bg-brand-glow";
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-ink", className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export const inkInput =
  "h-11 w-full rounded-xl border border-ink-border bg-ink/60 px-3.5 text-sm text-ink-foreground outline-none placeholder:text-ink-muted transition-colors focus-visible:border-brand-glow/50 focus-visible:ring-3 focus-visible:ring-brand-glow/40";

export const inkButtonPrimary =
  "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-ink outline-none transition-all hover:bg-white/90 focus-visible:ring-3 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-60";

export const inkButtonGhost =
  "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-ink-border px-4 text-sm font-medium text-ink-muted outline-none transition-colors hover:border-ink-muted/40 hover:text-ink-foreground focus-visible:ring-3 focus-visible:ring-brand-glow/40 disabled:cursor-not-allowed disabled:opacity-60";

export const inkButtonAccent =
  "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-brand-glow/40 px-3 text-xs font-semibold text-brand-glow outline-none transition-colors hover:bg-brand-glow/10 focus-visible:ring-3 focus-visible:ring-brand-glow/40 disabled:cursor-not-allowed disabled:opacity-60";

export const inkButtonDanger =
  "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-rose-400/30 px-3 text-xs font-semibold text-rose-300 outline-none transition-colors hover:bg-rose-500/10 focus-visible:ring-3 focus-visible:ring-rose-400/40 disabled:cursor-not-allowed disabled:opacity-60";

export function relativeTime(iso: string | Date) {
  const then = typeof iso === "string" ? new Date(iso) : iso;
  const seconds = Math.floor((Date.now() - then.getTime()) / 1000);
  if (seconds < 10) return "baru saja";
  if (seconds < 60) return `${seconds} detik lalu`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} hari lalu`;
  return then.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export function compactNumber(value: number) {
  if (Math.abs(value) < 1000) return value.toLocaleString("id-ID");
  return new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}
