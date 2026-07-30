"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bot,
  ChevronLeft,
  ChevronRight,
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
import { AuroraScene } from "@/components/motion/aurora-scene";
import { TiltCard } from "@/components/motion/tilt-card";
import { CountUp } from "@/components/motion/count-up";

const reveal = {
  hidden: { opacity: 0, y: 22, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)" },
};

const revealTransition = { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const };

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
  const [activeCurrencyIndex, setActiveCurrencyIndex] = useState(0);
  const currencyCarouselRef = useRef<HTMLDivElement>(null);

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
  const currencyCodes = Array.from(
    new Set([
      ...data.overview.byCurrency.map((item) => item.currency),
      ...data.wallets.map((wallet) => wallet.currency),
    ]),
  );
  const currencies = (currencyCodes.length > 0 ? currencyCodes : [data.overview.currency]).map(
    (currencyCode) => {
      const cashflow = data.overview.byCurrency.find(
        (item) => item.currency === currencyCode,
      );
      return {
        currency: currencyCode,
        totalIncome: cashflow?.totalIncome ?? 0,
        totalExpense: cashflow?.totalExpense ?? 0,
        balance: cashflow?.balance ?? 0,
        savingRate: cashflow?.savingRate ?? 0,
        totalAssets: data.wallets
          .filter((wallet) => wallet.currency === currencyCode)
          .reduce((total, wallet) => total + wallet.balance, 0),
      };
    },
  );

  function goToCurrency(index: number) {
    const targetIndex = Math.max(0, Math.min(index, currencies.length - 1));
    const container = currencyCarouselRef.current;
    const card = container?.children.item(targetIndex) as HTMLElement | null;
    if (!container || !card) return;
    const firstCard = container.children.item(0) as HTMLElement | null;
    container.scrollTo({
      left: card.offsetLeft - (firstCard?.offsetLeft ?? 0),
      behavior: "smooth",
    });
    setActiveCurrencyIndex(targetIndex);
  }

  function syncActiveCurrency() {
    const container = currencyCarouselRef.current;
    if (!container) return;
    const center = container.scrollLeft + container.clientWidth / 2;
    const firstCard = container.children.item(0) as HTMLElement | null;
    const baseOffset = firstCard?.offsetLeft ?? 0;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    Array.from(container.children).forEach((child, index) => {
      const card = child as HTMLElement;
      const distance = Math.abs(card.offsetLeft - baseOffset + card.offsetWidth / 2 - center);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    setActiveCurrencyIndex(closestIndex);
  }

  return (
    <>
      <AuroraScene withGrid={false} />
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.07 } } }}
        className="space-y-5 pt-1 lg:space-y-7 lg:pt-8"
      >
      <motion.section
        variants={reveal}
        transition={revealTransition}
        className="flex items-end justify-between gap-4"
      >
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
          className="app-surface rounded-xl transition-transform duration-200 hover:-translate-y-0.5 active:scale-95"
          onClick={() => setPrivateMode((value) => !value)}
          aria-label={privateMode ? "Tampilkan nominal" : "Sembunyikan nominal"}
        >
          {privateMode ? <EyeOff /> : <Eye />}
        </Button>
      </motion.section>

      <motion.section
        variants={reveal}
        transition={revealTransition}
        aria-label="Arus kas per mata uang"
        className="relative"
      >
        <div
          ref={currencyCarouselRef}
          role="region"
          aria-roledescription="carousel"
          aria-label="Geser untuk melihat arus kas setiap mata uang"
          tabIndex={0}
          onScroll={syncActiveCurrency}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") goToCurrency(activeCurrencyIndex - 1);
            if (event.key === "ArrowRight") goToCurrency(activeCurrencyIndex + 1);
          }}
          className="hide-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 outline-none sm:mx-0 sm:px-0"
        >
          {currencies.map((currency, index) => {
            const walletCount = data.wallets.filter(
              (wallet) => wallet.currency === currency.currency,
            ).length;
            const themes = [
              "from-[oklch(0.27_0.07_174)] to-[oklch(0.38_0.1_190)]",
              "from-[oklch(0.27_0.08_245)] to-[oklch(0.42_0.11_265)]",
              "from-[oklch(0.31_0.08_55)] to-[oklch(0.48_0.12_75)]",
              "from-[oklch(0.27_0.08_305)] to-[oklch(0.43_0.11_325)]",
            ];
            return (
              <TiltCard
                key={currency.currency}
                intensity={7}
                className="min-w-[calc(100%-1rem)] shrink-0 snap-center rounded-[1.8rem] sm:min-w-full"
              >
                <article
                  aria-label={`${currency.currency}, kartu ${index + 1} dari ${currencies.length}`}
                  className={`preserve-3d relative rounded-[1.8rem] bg-gradient-to-br ${themes[index % themes.length]} p-5 text-white shadow-[0_40px_80px_-42px_oklch(0.2_0.08_175)] sm:p-7`}
                >
                  <div
                    aria-hidden
                    className="sheen pointer-events-none absolute inset-0 overflow-hidden rounded-[1.8rem]"
                  >
                    <div className="absolute -right-16 -top-20 size-64 rounded-full border border-white/10 bg-white/[0.035]" />
                    <div className="absolute -bottom-24 right-20 size-48 rounded-full border border-white/10" />
                    <div className="absolute -right-10 top-1/3 size-40 rounded-full bg-white/10 blur-3xl" />
                  </div>
                  <div className="preserve-3d relative depth-1">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">
                            Arus kas bersih · {currency.currency}
                          </p>
                          {currency.currency === data.overview.currency && (
                            <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white/65">
                              Utama
                            </span>
                          )}
                        </div>
                        <p className="tabular-money mt-2 text-[2rem] font-semibold leading-none depth-2 sm:text-4xl">
                          {privateMode ? (
                            "••••••••"
                          ) : (
                            <CountUp
                              value={currency.balance}
                              format={(value) => formatCurrency(value, currency.currency)}
                            />
                          )}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] font-medium text-white/50">
                          <span>{walletCount} rekening</span>
                          <span className="size-1 rounded-full bg-white/25" />
                          <span>Total aset {money(currency.totalAssets, currency.currency)}</span>
                          <span className="size-1 rounded-full bg-white/25" />
                          <span>Saving rate {currency.savingRate}%</span>
                        </div>
                      </div>
                      <span className="grid size-10 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/10 backdrop-blur depth-3">
                        <ShieldCheck className="size-5 text-emerald-200" />
                      </span>
                    </div>

                    <div className="preserve-3d mt-7 grid grid-cols-2 gap-3 depth-2 sm:max-w-lg">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 backdrop-blur">
                        <div className="flex items-center gap-2 text-[10px] text-white/55">
                          <ArrowDownLeft className="size-3.5 text-emerald-300" /> Pemasukan
                        </div>
                        <p className="tabular-money mt-1.5 truncate text-sm font-semibold sm:text-base">
                          {money(currency.totalIncome, currency.currency)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 backdrop-blur">
                        <div className="flex items-center gap-2 text-[10px] text-white/55">
                          <ArrowUpRight className="size-3.5 text-amber-300" /> Pengeluaran
                        </div>
                        <p className="tabular-money mt-1.5 truncate text-sm font-semibold sm:text-base">
                          {money(currency.totalExpense, currency.currency)}
                        </p>
                      </div>
                    </div>
                  </div>
                </article>
              </TiltCard>
            );
          })}
        </div>

        {currencies.length > 1 && (
          <div className="mt-3 flex items-center justify-between px-1">
            <div
              className="flex items-center gap-1.5"
              aria-label={`Mata uang ${activeCurrencyIndex + 1} dari ${currencies.length}`}
            >
              {currencies.map((currency, index) => (
                <button
                  key={currency.currency}
                  type="button"
                  onClick={() => goToCurrency(index)}
                  aria-label={`Tampilkan ${currency.currency}`}
                  aria-current={index === activeCurrencyIndex ? "true" : undefined}
                  className={`h-1.5 rounded-full transition-all ${index === activeCurrencyIndex ? "w-6 bg-primary" : "w-1.5 bg-border"}`}
                />
              ))}
            </div>
            <div className="hidden items-center gap-1 sm:flex">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="rounded-xl"
                disabled={activeCurrencyIndex === 0}
                onClick={() => goToCurrency(activeCurrencyIndex - 1)}
                aria-label="Mata uang sebelumnya"
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <span className="min-w-14 text-center text-[10px] font-bold text-muted-foreground">
                {currencies[activeCurrencyIndex]?.currency}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="rounded-xl"
                disabled={activeCurrencyIndex === currencies.length - 1}
                onClick={() => goToCurrency(activeCurrencyIndex + 1)}
                aria-label="Mata uang berikutnya"
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </motion.section>

      <motion.section
        variants={reveal}
        transition={revealTransition}
        className="scene-3d grid grid-cols-4 gap-2 sm:gap-3"
      >
        {quickActions.map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.href}
              initial={{ opacity: 0, y: 14, rotateX: -18 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{ delay: 0.25 + index * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -5, rotateX: 6, scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              className="preserve-3d"
              style={{ transformPerspective: 800 }}
            >
              <Link
                href={item.href}
                className="app-surface flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl px-1 text-center text-[10px] font-semibold sm:min-h-24 sm:text-xs"
              >
                <span className="grid size-8 place-items-center rounded-xl bg-primary/8 text-primary sm:size-9">
                  <Icon className="size-4" strokeWidth={1.8} />
                </span>
                {item.label}
              </Link>
            </motion.div>
          );
        })}
      </motion.section>

      <motion.div
        variants={reveal}
        transition={revealTransition}
        className="grid gap-4 xl:grid-cols-[1.65fr_1fr]"
      >
        <Card className="app-surface sheen rounded-[1.5rem] ring-0 transition-shadow duration-300 hover:shadow-[0_28px_60px_-38px_oklch(0.25_0.08_175/.6)]">
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
                <Area type="monotone" dataKey="income" stroke="#0f766e" strokeWidth={2.2} fill="url(#incomeFill)" animationDuration={1100} animationEasing="ease-out" />
                <Area type="monotone" dataKey="expense" stroke="#d97706" strokeWidth={2.2} fill="url(#expenseFill)" animationDuration={1100} animationBegin={150} animationEasing="ease-out" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <TiltCard intensity={5} glare={false} className="rounded-[1.5rem]">
          <Card className="app-surface h-full rounded-[1.5rem] ring-0">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <p className="app-eyebrow">AI forecast</p>
                <CardTitle className="mt-1 text-base font-bold tracking-tight">Proyeksi bulan ini</CardTitle>
              </div>
              <span className="relative grid size-8 place-items-center">
                <span aria-hidden className="glow-ring absolute inset-0 rounded-full bg-primary/25 blur-md" />
                <Sparkles className="relative size-4 text-primary" />
              </span>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Sisa proyeksi</p>
                  <p className="tabular-money mt-1 text-xl font-bold">
                    {privateMode ? (
                      "••••••••"
                    ) : (
                      <CountUp
                        value={data.prediction.projectedBalance}
                        format={(value) => formatCurrency(value, primary?.currency ?? "IDR")}
                      />
                    )}
                  </p>
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
              <Link href="/dashboard/agent" className="group flex items-center justify-between text-xs font-semibold text-primary">
                Minta analisis lengkap
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
            </CardContent>
          </Card>
        </TiltCard>
      </motion.div>

      {data.wallets.length > 0 && (
        <motion.section variants={reveal} transition={revealTransition}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="app-eyebrow">Accounts</p>
              <h2 className="mt-1 text-base font-bold tracking-tight">Rekening kamu</h2>
            </div>
            <Link href="/dashboard/wallets" className="text-[11px] font-semibold text-primary">Lihat semua</Link>
          </div>
          <div className="hide-scrollbar scene-3d -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 xl:grid-cols-4">
            {data.wallets.map((wallet, index) => (
              <motion.div
                key={wallet.id}
                initial={{ opacity: 0, y: 18, rotateY: -12 }}
                whileInView={{ opacity: 1, y: 0, rotateY: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: index * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ y: -6, rotateX: 5 }}
                style={{ transformPerspective: 900 }}
                className="app-surface preserve-3d min-w-[78vw] shrink-0 snap-center rounded-2xl p-4 sm:min-w-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-xs font-semibold">
                    <span className="size-2.5 rounded-full" style={{ background: wallet.color ?? "#0f766e" }} />
                    {wallet.name}
                  </span>
                  <span className="text-[10px] font-bold text-muted-foreground">{wallet.currency}</span>
                </div>
                <p className="tabular-money mt-5 text-lg font-bold">{money(wallet.balance, wallet.currency)}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>
      )}

      <motion.div variants={reveal} transition={revealTransition} className="grid gap-4 lg:grid-cols-2">
        <Card className="app-surface rounded-[1.5rem] ring-0">
          <CardHeader><CardTitle className="text-sm font-bold">Pengeluaran terbesar</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {data.overview.topCategories.length === 0 && <p className="text-xs text-muted-foreground">Belum ada pengeluaran bulan ini.</p>}
            {data.overview.topCategories.slice(0, 5).map((category, index) => (
              <motion.div
                key={category.name}
                initial={{ opacity: 0, x: -14 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.06, duration: 0.4, ease: "easeOut" }}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <span className="flex items-center gap-2.5"><span className="size-2.5 rounded-full" style={{ background: category.color }} />{category.name}</span>
                <span className="tabular-money font-semibold">{money(category.amount)}</span>
              </motion.div>
            ))}
          </CardContent>
        </Card>

        <Card className="app-surface rounded-[1.5rem] ring-0">
          <CardHeader><CardTitle className="text-sm font-bold">Budget pulse</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {data.budgets.budgets.length === 0 && <p className="text-xs text-muted-foreground">Belum ada budget aktif.</p>}
            {data.budgets.budgets.slice(0, 4).map((budget, index) => (
              <motion.div
                key={budget.categoryName}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.07, duration: 0.4, ease: "easeOut" }}
                className="space-y-2"
              >
                <div className="flex justify-between text-[11px]"><span>{budget.categoryName}</span><span className="font-semibold">{budget.percentUsed}%</span></div>
                <Progress value={Math.min(budget.percentUsed, 100)} className="h-1.5" />
              </motion.div>
            ))}
          </CardContent>
        </Card>
      </motion.div>
      </motion.div>
    </>
  );
}
