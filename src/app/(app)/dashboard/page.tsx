"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

type DashboardData = {
  overview: {
    totalIncome: number;
    totalExpense: number;
    balance: number;
    savingRate: number;
    healthScore: number;
    expenseChangePct: number;
    topCategories: Array<{ name: string; amount: number; color: string }>;
  };
  cashflow: Array<{ label: string; income: number; expense: number }>;
  budgets: {
    budgets: Array<{
      categoryName: string;
      percentUsed: number;
      status: string;
      spent: number;
      limit: number;
    }>;
  };
  prediction: {
    projectedExpense: number;
    projectedBalance: number;
    riskOverspend: boolean;
  };
};

export default function OverviewPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((j) => setData(j.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return <p>Gagal memuat dashboard.</p>;

  const metrics = [
    { label: "Balance", value: formatCurrency(data.overview.balance) },
    { label: "Income", value: formatCurrency(data.overview.totalIncome) },
    { label: "Expense", value: formatCurrency(data.overview.totalExpense) },
    { label: "Saving rate", value: `${data.overview.savingRate}%` },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-primary">Overview</h1>
        <p className="text-muted-foreground">Ringkasan kesehatan keuangan bulan ini.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m, i) => (
          <motion.div
            key={m.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <Card className="border-border/60 bg-white/70 shadow-none backdrop-blur">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{m.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tracking-tight">{m.value}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/60 bg-white/70 shadow-none backdrop-blur lg:col-span-2">
          <CardHeader>
            <CardTitle>Cashflow</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.cashflow}>
                <defs>
                  <linearGradient id="inc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0F766E" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#0F766E" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#B45309" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#B45309" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#d6ddd8" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Area type="monotone" dataKey="income" stroke="#0F766E" fill="url(#inc)" />
                <Area type="monotone" dataKey="expense" stroke="#B45309" fill="url(#exp)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-white/70 shadow-none backdrop-blur">
          <CardHeader>
            <CardTitle>Financial health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="font-[family-name:var(--font-display)] text-5xl text-primary">
              {data.overview.healthScore}
            </div>
            <Progress value={data.overview.healthScore} />
            <p className="text-sm text-muted-foreground">
              Pengeluaran {data.overview.expenseChangePct > 0 ? "naik" : "turun"}{" "}
              {Math.abs(data.overview.expenseChangePct)}% vs bulan lalu.
            </p>
            <Badge variant={data.prediction.riskOverspend ? "destructive" : "secondary"}>
              {data.prediction.riskOverspend
                ? "Risiko overspend akhir bulan"
                : "Proyeksi akhir bulan aman"}
            </Badge>
            <p className="text-sm">
              Proyeksi expense: {formatCurrency(data.prediction.projectedExpense)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60 bg-white/70 shadow-none backdrop-blur">
          <CardHeader>
            <CardTitle>Top expense categories</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.overview.topCategories.length === 0 && (
              <p className="text-sm text-muted-foreground">Belum ada pengeluaran bulan ini.</p>
            )}
            {data.overview.topCategories.map((c) => (
              <div key={c.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: c.color }} />
                  {c.name}
                </div>
                <span className="font-medium">{formatCurrency(c.amount)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-white/70 shadow-none backdrop-blur">
          <CardHeader>
            <CardTitle>Budget pulse</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.budgets.budgets.length === 0 && (
              <p className="text-sm text-muted-foreground">Belum ada budget. Buat di halaman Budgets.</p>
            )}
            {data.budgets.budgets.slice(0, 5).map((b) => (
              <div key={b.categoryName} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{b.categoryName}</span>
                  <span>
                    {formatCurrency(b.spent)} / {formatCurrency(b.limit)}
                  </span>
                </div>
                <Progress value={Math.min(b.percentUsed, 100)} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
