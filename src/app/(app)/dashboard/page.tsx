"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bot,
  Eye,
  EyeOff,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

type DashboardData = {
  overview: {
    currency: string;
    totalIncome: number;
    totalExpense: number;
    balance: number;
    savingRate: number;
    healthScore: number;
    expenseChangePct: number;
    topCategories: Array<{ name: string; amount: number; color: string }>;
    byCurrency: Array<{
      currency: string;
      totalIncome: number;
      totalExpense: number;
      balance: number;
      savingRate: number;
    }>;
  };
  cashflow: { currency: string; series: Array<{ label: string; income: number; expense: number }> };
  budgets: {
    budgets: Array<{
      categoryName: string;
      percentUsed: number;
      status: string;
      spent: number;
      limit: number;
    }>;
  };
  prediction: { projectedExpense: number; projectedBalance: number; riskOverspend: boolean };
  wallets: Array<{
    id: string;
    name: string;
    currency: string;
    color: string | null;
    isDefault: boolean;
    balance: number;
  }>;
};

const quickActions = [
  { href: "/dashboard/transactions", label: "Tambah", icon: Plus },
  { href: "/dashboard/agent", label: "Tanya AI", icon: Bot },
  { href: "/dashboard/budgets", label: "Budget", icon: Target },
  { href: "/dashboard/wallets", label: "Rekening", icon: WalletCards },
];

export default function OverviewPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [privateMode, setPrivateMode] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((response) => response.json())
      .then((json) => setData(json.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 pt-2 lg:pt-8">
        <Skeleton className="h-8 w-48 rounded-xl" />
        <Skeleton className="h-64 rounded-[2rem]" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return <p className="pt-8 text-sm text-muted-foreground">Dashboard gagal dimuat.</p>;

  const primary =
    data.overview.byCurrency.find((item) => item.currency === data.overview.currency) ??
    data.overview.byCurrency[0];
  const money = (value: number, currency = primary?.currency ?? "IDR") =>
    privateMode ? "••••••••" : formatCurrency(value, currency);
  const monthName = new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" });

  return (
    <div className="space-y-5 pt-1 lg:space-y-7 lg:pt-8">
      <section className="flex items-end justify-between gap-4">
        <div>
          <p className="app-eyebrow mb-1">Ringkasan {monthName}</p>
          <h1 className="app-page-title">Selamat datang kembali</h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Semua yang perlu kamu tahu, dalam satu layar.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="app-surface rounded-xl"
          onClick={() => setPrivateMode((value) => !value)}
          aria-label={privateMode ? "Tampilkan nominal" : "Sembunyikan nominal"}
        >
          {privateMode ? <EyeOff /> : <Eye />}
        </Button>
      </section>

      <section className="relative overflow-hidden rounded-[1.8rem] bg-[linear-gradient(135deg,oklch(0.27_0.07_174),oklch(0.38_0.1_190))] p-5 text-white shadow-[0_30px_70px_-40px_oklch(0.2_0.08_175)] sm:p-7">
        <div className="absolute -right-16 -top-20 size-64 rounded-full border border-white/10 bg-white/[0.035]" />
        <div className="absolute -bottom-24 right-20 size-48 rounded-full border border-white/10" />
        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">
                Arus kas bersih · {primary?.currency}
              </p>
              <p className="tabular-money mt-2 text-[2rem] font-semibold leading-none sm:text-4xl">
                {money(primary?.balance ?? 0)}
              </p>
            </div>
            <span className="grid size-10 place-items-center rounded-2xl border border-white/10 bg-white/10 backdrop-blur">
              <ShieldCheck className="size-5 text-emerald-200" />
            </span>
          </div>

          <div className="mt-7 grid grid-cols-2 gap-3 sm:max-w-lg">
            <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 backdrop-blur">
              <div className="flex items-center gap-2 text-[10px] text-white/55">
                <ArrowDownLeft className="size-3.5 text-emerald-300" /> Pemasukan
              </div>
              <p className="tabular-money mt-1.5 text-sm font-semibold sm:text-base">
                {money(primary?.totalIncome ?? 0)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 backdrop-blur">
              <div className="flex items-center gap-2 text-[10px] text-white/55">
                <ArrowUpRight className="size-3.5 text-amber-300" /> Pengeluaran
              </div>
              <p className="tabular-money mt-1.5 text-sm font-semibold sm:text-base">
                {money(primary?.totalExpense ?? 0)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-4 gap-2 sm:gap-3">
        {quickActions.map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.div key={item.href} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
              <Link
                href={item.href}
                className="app-surface flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl px-1 text-center text-[10px] font-semibold transition-transform active:scale-95 sm:min-h-24 sm:text-xs"
              >
                <span className="grid size-8 place-items-center rounded-xl bg-primary/8 text-primary sm:size-9">
                  <Icon className="size-4" strokeWidth={1.8} />
                </span>
                {item.label}
              </Link>
            </motion.div>
          );
        })}
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <Card className="app-surface rounded-[1.5rem] ring-0">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <p className="app-eyebrow">Tren 6 bulan</p>
              <CardTitle className="mt-1 text-base font-bold tracking-tight">Arus kas</CardTitle>
            </div>
            <Badge variant="secondary" className="rounded-lg text-[10px]">{data.cashflow.currency}</Badge>
          </CardHeader>
          <CardContent className="h-60 px-1 sm:h-72 sm:px-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.cashflow.series} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0f766e" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#0f766e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d97706" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#d97706" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="4 6" stroke="rgba(80,105,95,.12)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#78847f" }} />
                <Tooltip formatter={(value) => formatCurrency(Number(value), data.cashflow.currency)} contentStyle={{ borderRadius: 14, border: "1px solid rgba(0,0,0,.06)", fontSize: 11 }} />
                <Area type="monotone" dataKey="income" stroke="#0f766e" strokeWidth={2.2} fill="url(#incomeFill)" />
                <Area type="monotone" dataKey="expense" stroke="#d97706" strokeWidth={2.2} fill="url(#expenseFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="app-surface rounded-[1.5rem] ring-0">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <p className="app-eyebrow">AI forecast</p>
              <CardTitle className="mt-1 text-base font-bold tracking-tight">Proyeksi bulan ini</CardTitle>
            </div>
            <Sparkles className="size-4 text-primary" />
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Sisa proyeksi</p>
                <p className="tabular-money mt-1 text-xl font-bold">{money(data.prediction.projectedBalance)}</p>
              </div>
              <Badge variant={data.prediction.riskOverspend ? "destructive" : "secondary"} className="rounded-lg">
                {data.prediction.riskOverspend ? "Perlu perhatian" : "On track"}
              </Badge>
            </div>
            <div className="rounded-2xl bg-muted/65 p-4">
              <div className="flex items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-card text-primary shadow-sm">
                  {data.overview.expenseChangePct <= 0 ? <TrendingDown className="size-4" /> : <TrendingUp className="size-4" />}
                </span>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Pengeluaran {data.overview.expenseChangePct > 0 ? "naik" : "turun"} <strong className="text-foreground">{Math.abs(data.overview.expenseChangePct)}%</strong> dibanding bulan lalu. Saving rate saat ini <strong className="text-foreground">{primary?.savingRate ?? 0}%</strong>.
                </p>
              </div>
            </div>
            <Link href="/dashboard/agent" className="flex items-center justify-between text-xs font-semibold text-primary">
              Minta analisis lengkap <ArrowRight className="size-4" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {data.wallets.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="app-eyebrow">Accounts</p>
              <h2 className="mt-1 text-base font-bold tracking-tight">Rekening kamu</h2>
            </div>
            <Link href="/dashboard/wallets" className="text-[11px] font-semibold text-primary">Lihat semua</Link>
          </div>
          <div className="hide-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 xl:grid-cols-4">
            {data.wallets.map((wallet) => (
              <div key={wallet.id} className="app-surface min-w-[78vw] snap-center rounded-2xl p-4 sm:min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-xs font-semibold">
                    <span className="size-2.5 rounded-full" style={{ background: wallet.color ?? "#0f766e" }} />
                    {wallet.name}
                  </span>
                  <span className="text-[10px] font-bold text-muted-foreground">{wallet.currency}</span>
                </div>
                <p className="tabular-money mt-5 text-lg font-bold">{money(wallet.balance, wallet.currency)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="app-surface rounded-[1.5rem] ring-0">
          <CardHeader><CardTitle className="text-sm font-bold">Pengeluaran terbesar</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {data.overview.topCategories.length === 0 && <p className="text-xs text-muted-foreground">Belum ada pengeluaran bulan ini.</p>}
            {data.overview.topCategories.slice(0, 5).map((category) => (
              <div key={category.name} className="flex items-center justify-between gap-3 text-xs">
                <span className="flex items-center gap-2.5"><span className="size-2.5 rounded-full" style={{ background: category.color }} />{category.name}</span>
                <span className="tabular-money font-semibold">{money(category.amount)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="app-surface rounded-[1.5rem] ring-0">
          <CardHeader><CardTitle className="text-sm font-bold">Budget pulse</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {data.budgets.budgets.length === 0 && <p className="text-xs text-muted-foreground">Belum ada budget aktif.</p>}
            {data.budgets.budgets.slice(0, 4).map((budget) => (
              <div key={budget.categoryName} className="space-y-2">
                <div className="flex justify-between text-[11px]"><span>{budget.categoryName}</span><span className="font-semibold">{budget.percentUsed}%</span></div>
                <Progress value={Math.min(budget.percentUsed, 100)} className="h-1.5" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
