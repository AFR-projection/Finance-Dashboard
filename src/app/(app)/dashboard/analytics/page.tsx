"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownLeft, ArrowUpRight, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";

type Dashboard = {
  cashflow: {
    currency: string;
    series: Array<{ label: string; income: number; expense: number }>;
  };
  overview: {
    currency: string;
    topCategories: Array<{ name: string; amount: number; color: string }>;
    byCurrency: Array<{
      currency: string;
      totalIncome: number;
      totalExpense: number;
      balance: number;
      savingRate: number;
    }>;
  };
  wallets: Array<{ id: string; name: string; currency: string; balance: number; isActive: boolean }>;
};

const AXIS = { fontSize: 10, fill: "#78847f" };

/** Compact axis labels: "Rp 12.247.500" would blow out the chart gutter. */
function shortNumber(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}jt`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}rb`;
  return String(Math.round(value));
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Dashboard | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((j) => setData(j.data));
  }, []);

  const derived = useMemo(() => {
    if (!data) return null;
    const series = data.cashflow.series;
    const latest = series.at(-1) ?? { income: 0, expense: 0, label: "" };
    const previous = series.at(-2) ?? { income: 0, expense: 0, label: "" };

    // Percentage change is meaningless against a zero baseline, so a fresh
    // month reports "no comparison" rather than a fake +100%.
    const delta = (now: number, before: number) =>
      before > 0 ? ((now - before) / before) * 100 : null;

    return {
      latest,
      previous,
      incomeDelta: delta(latest.income, previous.income),
      expenseDelta: delta(latest.expense, previous.expense),
      net: latest.income - latest.expense,
      netSeries: series.map((point) => ({
        label: point.label,
        net: point.income - point.expense,
      })),
    };
  }, [data]);

  if (!data || !derived) {
    return (
      <div className="space-y-4 pt-2 lg:pt-8">
        <Skeleton className="h-9 w-40 rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-3xl" />
      </div>
    );
  }

  const currency = data.cashflow.currency;
  const money = (value: number, code = currency) => formatCurrency(value, code);
  const activeWallets = data.wallets.filter((w) => w.isActive && w.currency === currency);
  const totalExpense = data.overview.topCategories.reduce((sum, c) => sum + c.amount, 0);

  const stats = [
    {
      label: `Masuk · ${derived.latest.label}`,
      value: money(derived.latest.income),
      delta: derived.incomeDelta,
      goodWhenUp: true,
      icon: ArrowDownLeft,
      tone: "bg-emerald-500/10 text-emerald-700",
    },
    {
      label: `Keluar · ${derived.latest.label}`,
      value: money(derived.latest.expense),
      delta: derived.expenseDelta,
      goodWhenUp: false,
      icon: ArrowUpRight,
      tone: "bg-amber-500/10 text-amber-700",
    },
    {
      label: "Selisih bulan ini",
      value: money(derived.net),
      delta: null,
      goodWhenUp: true,
      icon: derived.net >= 0 ? TrendingUp : TrendingDown,
      tone: derived.net >= 0 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive",
    },
  ];

  return (
    <div className="space-y-5 pb-10 pt-2 lg:pt-8">
      <div>
        <p className="app-eyebrow">Analisis</p>
        <h1 className="app-page-title mt-1.5">Analitik</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pola enam bulan terakhir dalam {currency}, dibandingkan bulan sebelumnya.
        </p>
      </div>

      {/* ---- Ringkasan + perbandingan periode ---- */}
      <section aria-label="Ringkasan periode" className="grid gap-3 sm:grid-cols-3">
        {stats.map((stat) => {
          const up = (stat.delta ?? 0) > 0;
          const good = stat.goodWhenUp ? up : !up;
          return (
            <div key={stat.label} className="app-surface rounded-2xl p-4">
              <span className={`grid size-8 place-items-center rounded-xl ${stat.tone}`}>
                <stat.icon aria-hidden className="size-4" strokeWidth={2.2} />
              </span>
              <p className="mt-3 truncate text-[11px] text-muted-foreground">{stat.label}</p>
              <p className="tabular-money mt-0.5 truncate text-lg font-bold tracking-[-0.02em] text-foreground">
                {stat.value}
              </p>
              {stat.delta === null ? (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Minus aria-hidden className="size-3" strokeWidth={2.4} />
                  Belum ada pembanding
                </p>
              ) : (
                <p
                  className={`mt-1 flex items-center gap-1 text-[11px] font-medium ${
                    good ? "text-emerald-700" : "text-destructive"
                  }`}
                >
                  {up ? (
                    <TrendingUp aria-hidden className="size-3" strokeWidth={2.4} />
                  ) : (
                    <TrendingDown aria-hidden className="size-3" strokeWidth={2.4} />
                  )}
                  {Math.abs(stat.delta).toFixed(0)}% vs {derived.previous.label}
                </p>
              )}
            </div>
          );
        })}
      </section>

      {/* ---- Tren selisih bersih ---- */}
      <section className="app-surface rounded-3xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="app-eyebrow">Tren</p>
            <h2 className="mt-1 text-base font-bold tracking-[-0.02em] text-foreground">
              Selisih bersih per bulan
            </h2>
          </div>
          <span className="rounded-lg bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
            {currency}
          </span>
        </div>
        <div className="mt-5 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={derived.netSeries}>
              <defs>
                <linearGradient id="netFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0f766e" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#0f766e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="4 6" stroke="rgba(80,105,95,.12)" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={AXIS} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={AXIS}
                width={46}
                tickFormatter={shortNumber}
              />
              <Tooltip
                formatter={(value) => money(Number(value))}
                contentStyle={{ borderRadius: 14, border: "1px solid rgba(0,0,0,.06)", fontSize: 12 }}
              />
              <Area
                type="monotone"
                dataKey="net"
                stroke="#0f766e"
                strokeWidth={2.4}
                fill="url(#netFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---- Masuk vs keluar ---- */}
        <section className="app-surface rounded-3xl p-5 sm:p-6">
          <p className="app-eyebrow">Perbandingan</p>
          <h2 className="mt-1 text-base font-bold tracking-[-0.02em] text-foreground">
            Masuk vs keluar
          </h2>
          <div className="mt-5 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.cashflow.series} barGap={4}>
                <CartesianGrid vertical={false} strokeDasharray="4 6" stroke="rgba(80,105,95,.12)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={AXIS} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={AXIS}
                  width={46}
                  tickFormatter={shortNumber}
                />
                <Tooltip
                  cursor={{ fill: "rgba(80,105,95,.06)" }}
                  formatter={(value, name) => [
                    money(Number(value)),
                    name === "income" ? "Masuk" : "Keluar",
                  ]}
                  contentStyle={{ borderRadius: 14, border: "1px solid rgba(0,0,0,.06)", fontSize: 12 }}
                />
                <Bar dataKey="income" fill="#0f766e" radius={[6, 6, 0, 0]} maxBarSize={26} />
                <Bar dataKey="expense" fill="#d97706" radius={[6, 6, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex items-center justify-center gap-5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-sm bg-[#0f766e]" /> Masuk
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-sm bg-[#d97706]" /> Keluar
            </span>
          </div>
        </section>

        {/* ---- Kategori ---- */}
        <section className="app-surface rounded-3xl p-5 sm:p-6">
          <p className="app-eyebrow">Kategori</p>
          <h2 className="mt-1 text-base font-bold tracking-[-0.02em] text-foreground">
            Ke mana uang pergi
          </h2>

          {data.overview.topCategories.length === 0 ? (
            <p className="mt-10 text-center text-sm text-muted-foreground">
              Belum ada pengeluaran bulan ini.
            </p>
          ) : (
            <>
              <div className="mt-4 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.overview.topCategories}
                      dataKey="amount"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={88}
                      paddingAngle={3}
                      strokeWidth={0}
                    >
                      {data.overview.topCategories.map((category) => (
                        <Cell key={category.name} fill={category.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => money(Number(value))}
                      contentStyle={{
                        borderRadius: 14,
                        border: "1px solid rgba(0,0,0,.06)",
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Written legend: colour alone must not carry the meaning. */}
              <ul className="mt-4 space-y-2">
                {data.overview.topCategories.slice(0, 5).map((category) => {
                  const share = totalExpense > 0 ? (category.amount / totalExpense) * 100 : 0;
                  return (
                    <li key={category.name} className="flex items-center gap-3 text-sm">
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: category.color }}
                      />
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {category.name}
                      </span>
                      <span className="tabular-money shrink-0 text-muted-foreground">
                        {money(category.amount)}
                      </span>
                      <span className="tabular-money w-10 shrink-0 text-right text-xs text-muted-foreground">
                        {share.toFixed(0)}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </div>

      {/* ---- Sebaran per rekening ---- */}
      {activeWallets.length > 0 && (
        <section className="app-surface rounded-3xl p-5 sm:p-6">
          <p className="app-eyebrow">Rekening</p>
          <h2 className="mt-1 text-base font-bold tracking-[-0.02em] text-foreground">
            Sebaran saldo {currency}
          </h2>
          <ul className="mt-5 space-y-3">
            {activeWallets.map((wallet) => {
              const total = activeWallets.reduce((sum, w) => sum + Math.max(0, w.balance), 0);
              const share = total > 0 ? (Math.max(0, wallet.balance) / total) * 100 : 0;
              return (
                <li key={wallet.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate text-foreground">{wallet.name}</span>
                    <span className="tabular-money shrink-0 font-semibold text-foreground">
                      {money(wallet.balance, wallet.currency)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-border">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
