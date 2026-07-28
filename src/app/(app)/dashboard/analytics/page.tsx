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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-primary">Analytics</h1>
        <p className="text-muted-foreground">Cashflow, kategori, dan perbandingan bulanan.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60 bg-white/70 shadow-none">
          <CardHeader>
            <CardTitle>Income vs Expense · {data.cashflow.currency}</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
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

        <Card className="border-border/60 bg-white/70 shadow-none">
          <CardHeader>
            <CardTitle>Expense by category</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
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
