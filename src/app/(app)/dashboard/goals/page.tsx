"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Goal = {
  id: string;
  goalName: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string | null;
  progress: number;
};

export default function GoalsPage() {
  const [items, setItems] = useState<Goal[]>([]);
  const [goalName, setGoalName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("0");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/goals");
    const json = await res.json();
    setItems(json.data?.items ?? []);
    setLoading(false);
  }

  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    return () => clearTimeout(initial);
  }, []);

  async function createGoal(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goalName,
        targetAmount: Number(targetAmount),
        currentAmount: Number(currentAmount || 0),
      }),
    });
    if (!res.ok) {
      toast.error("Gagal membuat goal");
      return;
    }
    toast.success("Goal dibuat");
    setGoalName("");
    setTargetAmount("");
    setCurrentAmount("0");
    load();
  }

  async function addProgress(goal: Goal, delta: number) {
    const res = await fetch("/api/goals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: goal.id,
        currentAmount: Math.max(0, goal.currentAmount + delta),
      }),
    });
    if (!res.ok) {
      toast.error("Gagal update");
      return;
    }
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/goals?id=${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((g) => g.id !== id));
  }

  return (
    <div className="space-y-5 pt-1 lg:space-y-6 lg:pt-8">
      <div>
        <p className="app-eyebrow mb-1">Future money</p>
        <h1 className="app-page-title">Financial goals</h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">Ubah target besar menjadi progres yang terlihat.</p>
      </div>

      <Card className="app-surface rounded-[1.5rem] ring-0">
        <CardHeader>
          <CardTitle className="text-base">Tambah goal</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={createGoal} className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label>Nama</Label>
              <Input
                value={goalName}
                onChange={(e) => setGoalName(e.target.value)}
                placeholder="Dana darurat"
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Target</Label>
              <Input
                type="number"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="10000000"
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Saat ini</Label>
              <Input
                type="number"
                value={currentAmount}
                onChange={(e) => setCurrentAmount(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                Simpan
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {loading && <p>Loading...</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((g) => (
          <Card key={g.id} className="app-surface rounded-[1.5rem] ring-0">
            <CardHeader className="flex flex-row items-start justify-between gap-2">
              <div>
                <CardTitle className="text-lg">{g.goalName}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {formatCurrency(g.currentAmount)} / {formatCurrency(g.targetAmount)}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => remove(g.id)}>
                Hapus
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={g.progress} />
              <p className="text-xs text-muted-foreground">{g.progress}% tercapai</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => addProgress(g, 100000)}>
                  +100rb
                </Button>
                <Button size="sm" variant="outline" onClick={() => addProgress(g, 500000)}>
                  +500rb
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
