"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDownLeft, ArrowUpRight, Layers3 } from "lucide-react";

export default function AnalyticsPage() {
  const [data, setData] = useState<{
    cashflow: { currency: string; series: Array<{ label: string; income: number; expense: number }> };
    overview: { topCategories: Array<{ name: string; amount: number; color: string }> };
  } | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((j) => setData(j.data));
  }, []);

  if (!data) return <p>Loading analytics...</p>;

  const latest = data.cashflow.series.at(-1) ?? { income: 0, expense: 0, label: "" };
  const topCategory = data.overview.topCategories[0];

  return (
    <div className="space-y-5 pt-1 lg:space-y-6 lg:pt-8">
      <div>
        <p className="app-eyebrow mb-1">Deep dive</p>
        <h1 className="app-page-title">Analitik</h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">Lihat pola, perbandingan, dan penggerak utama.</p>
      </div>

      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {[
          { label: "Masuk", value: formatCurrency(latest.income, data.cashflow.currency), icon: ArrowDownLeft, tone: "text-emerald-700 bg-emerald-500/10" },
          { label: "Keluar", value: formatCurrency(latest.expense, data.cashflow.currency), icon: ArrowUpRight, tone: "text-amber-700 bg-amber-500/10" },
          { label: "Top kategori", value: topCategory?.name ?? "—", icon: Layers3, tone: "text-primary bg-primary/8" },
        ].map((item) => (
          <div key={item.label} className="app-surface min-w-0 rounded-2xl p-3 sm:p-4">
            <span className={`grid size-7 place-items-center rounded-xl ${item.tone}`}><item.icon className="size-3.5" /></span>
            <p className="mt-3 truncate text-[9px] text-muted-foreground">{item.label}</p>
            <p className="tabular-money mt-0.5 truncate text-[11px] font-bold sm:text-sm">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="app-surface rounded-[1.5rem] ring-0">
          <CardHeader>
            <CardTitle>Income vs Expense · {data.cashflow.currency}</CardTitle>
          </CardHeader>
          <CardContent className="h-72 px-1 sm:h-80 sm:px-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.cashflow.series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d6ddd8" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip formatter={(v) => formatCurrency(Number(v), data.cashflow.currency)} />
                <Legend />
                <Bar dataKey="income" fill="#0F766E" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" fill="#B45309" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="app-surface rounded-[1.5rem] ring-0">
          <CardHeader>
            <CardTitle>Expense by category</CardTitle>
          </CardHeader>
          <CardContent className="h-72 px-1 sm:h-80 sm:px-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.overview.topCategories}
                  dataKey="amount"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                >
                  {data.overview.topCategories.map((c) => (
                    <Cell key={c.name} fill={c.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
