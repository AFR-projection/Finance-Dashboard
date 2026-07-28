"use client";

import { FormEvent, useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type BudgetRow = {
  id: string;
  categoryName: string;
  spent: number;
  limit: number;
  percentUsed: number;
  status: string;
  categoryId: string;
};

type Category = { id: string; name: string; type: string };

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [limit, setLimit] = useState("");

  async function load() {
    const [b, c] = await Promise.all([
      fetch("/api/budgets").then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
    ]);
    setBudgets(b.data?.budgets ?? []);
    setCategories((c.data ?? []).filter((x: Category) => x.type === "EXPENSE"));
  }

  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    return () => clearTimeout(initial);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!categoryId || !limit) return;
    await fetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, monthlyLimit: Number(limit) }),
    });
    setLimit("");
    await load();
  }

  return (
    <div className="space-y-5 pt-1 lg:space-y-6 lg:pt-8">
      <div>
        <p className="app-eyebrow mb-1">Spending guardrails</p>
        <h1 className="app-page-title">Budget</h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">Batas pengeluaran yang bekerja sebelum terlambat.</p>
      </div>

      <Card className="app-surface rounded-[1.5rem] ring-0">
        <CardHeader>
          <CardTitle>Set monthly budget</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-2.5 sm:grid-cols-[1fr_1fr_auto]">
            <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? "")}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="Limit (IDR)"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="h-10 w-full"
            />
            <Button type="submit" className="h-10 rounded-xl">Simpan</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {budgets.map((b) => (
          <Card key={b.id} className="app-surface rounded-2xl ring-0">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{b.categoryName}</CardTitle>
              <span
                className={
                  b.status === "over"
                    ? "text-sm text-destructive"
                    : b.status === "warning"
                      ? "text-sm text-amber-700"
                      : "text-sm text-emerald-700"
                }
              >
                {b.status}
              </span>
            </CardHeader>
            <CardContent className="space-y-2">
              <Progress value={Math.min(b.percentUsed, 100)} />
              <p className="text-sm text-muted-foreground">
                {formatCurrency(b.spent)} / {formatCurrency(b.limit)} ({b.percentUsed}%)
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
