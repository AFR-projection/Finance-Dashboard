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
    load();
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
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-primary">Budgets</h1>
        <p className="text-muted-foreground">Pantau progress dan warning mendekati limit.</p>
      </div>

      <Card className="border-border/60 bg-white/70 shadow-none">
        <CardHeader>
          <CardTitle>Set monthly budget</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-wrap gap-3">
            <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? "")}>
              <SelectTrigger className="w-48">
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
              className="w-48"
            />
            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {budgets.map((b) => (
          <Card key={b.id} className="border-border/60 bg-white/70 shadow-none">
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
