"use client";

import { FormEvent, useEffect, useState } from "react";
import { CalendarDays, Goal as GoalIcon, Loader2, Plus, Trash2 } from "lucide-react";
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

type Goal = {
  id: string;
  goalName: string;
  walletId: string;
  walletName: string;
  walletCurrency: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string | null;
  progress: number;
};

export default function GoalsPage() {
  const [items, setItems] = useState<Goal[] | null>(null);
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [goalName, setGoalName] = useState("");
  const [walletId, setWalletId] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("0");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const [g, w] = await Promise.all([
      fetch("/api/goals").then((r) => r.json()),
      fetch("/api/wallets").then((r) => r.json()),
    ]);
    setItems(g.data?.items ?? []);
    setWallets((w.data ?? []).filter((x: WalletOption) => x.isActive));
  }

  useEffect(() => {
    void load();
  }, []);

  async function createGoal(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalName,
          walletId,
          targetAmount: Number(targetAmount),
          currentAmount: Number(currentAmount || 0),
          deadline: deadline || undefined,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        toast.error(json.error?.message ?? "Gagal membuat target");
        return;
      }
      toast.success("Target dibuat");
      setGoalName("");
      setTargetAmount("");
      setCurrentAmount("0");
      setDeadline("");
      void load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string, name: string) {
    const res = await fetch(`/api/goals?id=${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!json.ok) {
      toast.error(json.error?.message ?? "Gagal menghapus");
      return;
    }
    toast.success(`Target "${name}" dihapus`);
    void load();
  }

  if (items === null) {
    return (
      <div className="space-y-4 pt-2 lg:pt-8">
        <Skeleton className="h-9 w-40 rounded-xl" />
        <Skeleton className="h-48 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-10 pt-2 lg:pt-8">
      <div>
        <p className="app-eyebrow">Perencanaan</p>
        <h1 className="app-page-title mt-1.5">Target Tabungan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tiap target menabung ke satu rekening, jadi nominalnya punya mata uang yang jelas.
        </p>
      </div>

      {wallets.length === 0 ? (
        <NoWalletState what="Target tabungan" />
      ) : (
        <>
          <section className="app-surface rounded-3xl p-6">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-xl bg-secondary text-primary">
                <Plus aria-hidden className="size-4.5" strokeWidth={2.2} />
              </span>
              <h2 className="text-sm font-bold text-foreground">Buat target baru</h2>
            </div>

            <form onSubmit={createGoal} className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="goalName" className="text-sm font-semibold text-foreground">
                  Nama target
                </Label>
                <Input
                  id="goalName"
                  value={goalName}
                  onChange={(e) => setGoalName(e.target.value)}
                  placeholder="Dana darurat"
                  className="mt-2 h-11 rounded-xl"
                />
              </div>

              <WalletPicker
                wallets={wallets}
                value={walletId}
                onChange={setWalletId}
                label="Menabung di rekening"
              />

              <div>
                <Label htmlFor="targetAmount" className="text-sm font-semibold text-foreground">
                  Target nominal
                </Label>
                <Input
                  id="targetAmount"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  placeholder="10000000"
                  className="tabular-money mt-2 h-11 rounded-xl"
                />
              </div>

              <div>
                <Label htmlFor="currentAmount" className="text-sm font-semibold text-foreground">
                  Sudah terkumpul
                </Label>
                <Input
                  id="currentAmount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={currentAmount}
                  onChange={(e) => setCurrentAmount(e.target.value)}
                  className="tabular-money mt-2 h-11 rounded-xl"
                />
              </div>

              <div>
                <Label htmlFor="deadline" className="text-sm font-semibold text-foreground">
                  Tenggat <span className="font-normal text-muted-foreground">(opsional)</span>
                </Label>
                <Input
                  id="deadline"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="mt-2 h-11 rounded-xl"
                />
              </div>

              <div className="flex items-end">
                <Button
                  type="submit"
                  disabled={saving || !goalName.trim() || !walletId || Number(targetAmount) <= 0}
                  className="h-11 w-full cursor-pointer rounded-2xl text-sm font-semibold"
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                  Buat target
                </Button>
              </div>
            </form>
          </section>

          {items.length === 0 ? (
            <div className="app-surface rounded-3xl p-10 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-secondary text-primary">
                <GoalIcon aria-hidden className="size-6" strokeWidth={1.8} />
              </span>
              <p className="mt-4 text-sm text-muted-foreground">
                Belum ada target. Buat satu di atas untuk mulai menabung terarah.
              </p>
            </div>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {items.map((goal) => {
                const done = goal.progress >= 100;
                const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
                return (
                  <li key={goal.id} className="app-surface rounded-3xl p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-foreground">
                          {goal.goalName}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {goal.walletName} · {goal.walletCurrency}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void remove(goal.id, goal.goalName)}
                        aria-label={`Hapus target ${goal.goalName}`}
                        className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-xl text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/60"
                      >
                        <Trash2 className="size-4" strokeWidth={2} />
                      </button>
                    </div>

                    <p className="tabular-money mt-4 text-xl font-bold text-foreground">
                      {formatCurrency(goal.currentAmount, goal.walletCurrency)}
                      <span className="ml-1.5 text-sm font-medium text-muted-foreground">
                        / {formatCurrency(goal.targetAmount, goal.walletCurrency)}
                      </span>
                    </p>

                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-border">
                      <div
                        className={`h-full rounded-full transition-all ${
                          done ? "bg-emerald-500" : "bg-primary"
                        }`}
                        style={{ width: `${Math.min(100, goal.progress)}%` }}
                      />
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className={done ? "font-semibold text-emerald-700" : ""}>
                        {done
                          ? "Tercapai"
                          : `Kurang ${formatCurrency(remaining, goal.walletCurrency)}`}
                      </span>
                      <span>· {goal.progress}%</span>
                      {goal.deadline && (
                        <span className="flex items-center gap-1">
                          <CalendarDays aria-hidden className="size-3.5" strokeWidth={2} />
                          {new Date(goal.deadline).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            timeZone: "UTC",
                          })}
                        </span>
                      )}
                    </div>
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
