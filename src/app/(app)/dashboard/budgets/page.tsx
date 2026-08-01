"use client";

import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, Loader2, PiggyBank, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  NoWalletState,
  WalletPicker,
  type WalletOption,
} from "@/components/finance/wallet-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";

type BudgetRow = {
  id: string;
  categoryId: string;
  categoryName: string;
  color: string;
  walletId: string;
  walletName: string;
  walletCurrency: string;
  spent: number;
  limit: number;
  remaining: number;
  percentUsed: number;
  status: string;
};

type Category = { id: string; name: string; type: string };

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<BudgetRow[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [walletId, setWalletId] = useState("");
  const [limit, setLimit] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const [b, c, w] = await Promise.all([
      fetch("/api/budgets").then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
      fetch("/api/wallets").then((r) => r.json()),
    ]);
    setBudgets(b.data?.budgets ?? []);
    setCategories((c.data ?? []).filter((x: Category) => x.type === "EXPENSE"));
    setWallets((w.data ?? []).filter((x: WalletOption) => x.isActive));
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, walletId, monthlyLimit: Number(limit) }),
      });
      const json = await res.json();
      if (!json.ok) {
        toast.error(json.error?.message ?? "Gagal menyimpan budget");
        return;
      }
      toast.success("Budget tersimpan");
      setLimit("");
      setCategoryId("");
      void load();
    } finally {
      setSaving(false);
    }
  }

  if (budgets === null) {
    return (
      <div className="space-y-4 pt-2 lg:pt-8">
        <Skeleton className="h-9 w-40 rounded-xl" />
        <Skeleton className="h-44 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }

  const monthName = new Date().toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="space-y-5 pb-10 pt-2 lg:pt-8">
      <div>
        <p className="app-eyebrow">Perencanaan</p>
        <h1 className="app-page-title mt-1.5">Budget</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Batas pengeluaran per kategori, per rekening — periode {monthName}.
        </p>
      </div>

      {wallets.length === 0 ? (
        <NoWalletState what="Budget" />
      ) : (
        <>
          <section className="app-surface rounded-3xl p-6">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-xl bg-secondary text-primary">
                <Plus aria-hidden className="size-4.5" strokeWidth={2.2} />
              </span>
              <h2 className="text-sm font-bold text-foreground">Buat / ubah budget</h2>
            </div>

            <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="categoryId" className="text-sm font-semibold text-foreground">
                  Kategori
                </Label>
                <select
                  id="categoryId"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="mt-2 h-11 w-full cursor-pointer rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
                >
                  <option value="">Pilih kategori…</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <WalletPicker wallets={wallets} value={walletId} onChange={setWalletId} />

              <div>
                <Label htmlFor="limit" className="text-sm font-semibold text-foreground">
                  Batas per bulan
                </Label>
                <Input
                  id="limit"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  placeholder="500000"
                  className="tabular-money mt-2 h-11 rounded-xl"
                />
              </div>

              <div className="sm:col-span-3">
                <Button
                  type="submit"
                  disabled={saving || !categoryId || !walletId || Number(limit) <= 0}
                  className="h-11 cursor-pointer rounded-2xl px-6 text-sm font-semibold"
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                  Simpan budget
                </Button>
              </div>
            </form>
          </section>

          {budgets.length === 0 ? (
            <div className="app-surface rounded-3xl p-10 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-secondary text-primary">
                <PiggyBank aria-hidden className="size-6" strokeWidth={1.8} />
              </span>
              <p className="mt-4 text-sm text-muted-foreground">
                Belum ada budget bulan ini. Buat satu di atas.
              </p>
            </div>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {budgets.map((budget) => {
                const pct = Math.min(100, budget.percentUsed);
                const over = budget.status === "over";
                const warn = budget.status === "warning";
                return (
                  <li key={budget.id} className="app-surface rounded-3xl p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                          <span
                            aria-hidden
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ background: budget.color }}
                          />
                          {budget.categoryName}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {budget.walletName} · {budget.walletCurrency}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          over
                            ? "bg-destructive/10 text-destructive"
                            : warn
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {over ? "Lewat batas" : warn ? "Hampir habis" : "Aman"}
                      </span>
                    </div>

                    <p className="tabular-money mt-4 text-xl font-bold text-foreground">
                      {formatCurrency(budget.spent, budget.walletCurrency)}
                      <span className="ml-1.5 text-sm font-medium text-muted-foreground">
                        / {formatCurrency(budget.limit, budget.walletCurrency)}
                      </span>
                    </p>

                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-border">
                      <div
                        className={`h-full rounded-full transition-all ${
                          over ? "bg-destructive" : warn ? "bg-amber-500" : "bg-primary"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <p
                      className={`mt-2.5 flex items-center gap-1.5 text-xs ${
                        over ? "text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      {over && <AlertTriangle className="size-3.5" strokeWidth={2.2} />}
                      {over
                        ? `Lewat ${formatCurrency(Math.abs(budget.remaining), budget.walletCurrency)}`
                        : `Sisa ${formatCurrency(budget.remaining, budget.walletCurrency)} · ${budget.percentUsed}% terpakai`}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
