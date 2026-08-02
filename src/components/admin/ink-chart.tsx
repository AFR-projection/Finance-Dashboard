"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { compactNumber } from "@/components/admin/ui";

/* Recharts on the ink surface.
 *
 * The app's existing charts hardcode light-mode hex and are unreadable here, so
 * this is a parallel palette rather than a reuse. Series colours are derived
 * from the same oklch tokens the panel already uses. */

export const INK_SERIES = {
  primary: "oklch(0.78 0.12 175)",
  secondary: "oklch(0.80 0.13 92)",
  tertiary: "oklch(0.72 0.11 250)",
  danger: "oklch(0.72 0.16 20)",
  violet: "oklch(0.74 0.13 305)",
} as const;

export const INK_SERIES_LIST = Object.values(INK_SERIES);

const AXIS = { fontSize: 10, fill: "oklch(0.72 0.02 180)" } as const;
const GRID_STROKE = "oklch(0.72 0.02 180 / 0.14)";

type TooltipRow = { name?: string; value?: number | string; color?: string; dataKey?: string };

/**
 * Tooltip number formats, named rather than passed as a function.
 *
 * Every one of these charts is rendered from a server component, and a function
 * prop cannot cross that boundary — so the caller names the format and the
 * client side owns the implementation.
 */
export type ValueFormat = "compact" | "idr";

const FORMATTERS: Record<ValueFormat, (value: number) => string> = {
  compact: (value) => compactNumber(value),
  idr: (value) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(value),
};

function InkTooltip({
  active,
  payload,
  label,
  format = "compact",
}: {
  active?: boolean;
  payload?: TooltipRow[];
  label?: string;
  format?: ValueFormat;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-ink-border bg-ink/95 px-3 py-2 shadow-xl backdrop-blur-xl">
      {label && <p className="mb-1.5 text-[11px] font-bold text-ink-foreground">{label}</p>}
      <div className="space-y-1">
        {payload.map((row, index) => (
          <div key={index} className="flex items-center gap-2 text-[11px]">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-sm"
              style={{ background: row.color }}
            />
            <span className="text-ink-muted">{row.name}</span>
            <span className="tabular-money ml-auto font-semibold text-ink-foreground">
              {FORMATTERS[format](Number(row.value))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export type Series = { key: string; label: string; color: string };

export function InkAreaChart({
  data,
  series,
  xKey = "label",
  height = 240,
  format = "compact",
}: {
  data: Record<string, unknown>[];
  series: Series[];
  xKey?: string;
  height?: number;
  format?: ValueFormat;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`ink-fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="4 6" stroke={GRID_STROKE} />
          <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis
            tick={AXIS}
            axisLine={false}
            tickLine={false}
            width={46}
            tickFormatter={compactNumber}
          />
          <Tooltip
            cursor={{ stroke: GRID_STROKE }}
            content={<InkTooltip format={format} />}
          />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#ink-fill-${s.key})`}
              activeDot={{ r: 3, strokeWidth: 0 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function InkBarChart({
  data,
  series,
  xKey = "label",
  height = 240,
  stacked = false,
  format = "compact",
}: {
  data: Record<string, unknown>[];
  series: Series[];
  xKey?: string;
  height?: number;
  stacked?: boolean;
  format?: ValueFormat;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} strokeDasharray="4 6" stroke={GRID_STROKE} />
          <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis
            tick={AXIS}
            axisLine={false}
            tickLine={false}
            width={46}
            tickFormatter={compactNumber}
          />
          <Tooltip
            cursor={{ fill: "oklch(0.72 0.02 180 / 0.06)" }}
            content={<InkTooltip format={format} />}
          />
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              stackId={stacked ? "a" : undefined}
              radius={stacked ? [0, 0, 0, 0] : [5, 5, 0, 0]}
              maxBarSize={26}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function InkDonut({
  data,
  height = 200,
  format = "compact",
}: {
  data: { name: string; value: number; color: string }[];
  height?: number;
  format?: ValueFormat;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="86%"
            paddingAngle={2}
            stroke="none"
          >
            {data.map((slice) => (
              <Cell key={slice.name} fill={slice.color} />
            ))}
          </Pie>
          <Tooltip content={<InkTooltip format={format} />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Tiny trend line for stat tiles — no axes, no grid, no interaction. */
export function Sparkline({
  data,
  dataKey,
  color = INK_SERIES.primary,
  height = 34,
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  color?: string;
  height?: number;
}) {
  return (
    <div style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.8}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Legends are hand-built here, as they are elsewhere in the app. */
export function ChartLegend({ series }: { series: Series[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5 text-[11px] text-ink-muted">
          <span aria-hidden className="size-2.5 rounded-sm" style={{ background: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}
