"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ShareData = {
  displayName: string;
  balance: number | null;
  totalIncome: number | null;
  totalExpense: number | null;
  savingRate: number | null;
  healthScore: number;
  cashflow: { currency: string; series: Array<{ label: string; income: number; expense: number }> };
  currency: string;
  topCategories: Array<{ name: string; amount: number }>;
  goals: Array<{ goalName: string; targetAmount: number; currentAmount: number }>;
};

export default function PublicSharePage() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/share/${params.token}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) setError("Profile not available");
        else setData(j.data);
      })
      .catch(() => setError("Failed to load"));
  }, [params.token]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Loading shared profile...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">Shared finance profile</p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl text-primary">
            {data.displayName}
          </h1>
          <p className="text-sm text-muted-foreground">Health score: {data.healthScore}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {data.balance != null && (
            <Card className="border-border/60 bg-white/70 shadow-none">
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Balance</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-semibold">
                {formatCurrency(data.balance, data.currency)}
              </CardContent>
            </Card>
          )}
          {data.totalIncome != null && (
            <Card className="border-border/60 bg-white/70 shadow-none">
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Income</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-semibold">
                {formatCurrency(data.totalIncome, data.currency)}
              </CardContent>
            </Card>
          )}
          {data.totalExpense != null && (
            <Card className="border-border/60 bg-white/70 shadow-none">
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Expense</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-semibold">
                {formatCurrency(data.totalExpense, data.currency)}
              </CardContent>
            </Card>
          )}
        </div>

        {data.cashflow.series.length > 0 && (
          <Card className="border-border/60 bg-white/70 shadow-none">
            <CardHeader>
              <CardTitle>Cashflow · {data.cashflow.currency}</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.cashflow.series}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip formatter={(v) => formatCurrency(Number(v), data.cashflow.currency)} />
                  <Bar dataKey="income" fill="#0F766E" />
                  <Bar dataKey="expense" fill="#B45309" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {data.goals.length > 0 && (
          <Card className="border-border/60 bg-white/70 shadow-none">
            <CardHeader>
              <CardTitle>Goals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.goals.map((g) => (
                <div key={g.goalName} className="flex justify-between text-sm">
                  <span>{g.goalName}</span>
                  <span>
                    {formatCurrency(g.currentAmount, data.currency)} / {formatCurrency(g.targetAmount, data.currency)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
