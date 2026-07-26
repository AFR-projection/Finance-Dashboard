"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type ShareProfile = {
  token: string;
  visibility: "PRIVATE" | "PUBLIC" | "SELECTED";
  showBalance: boolean;
  showIncome: boolean;
  showExpense: boolean;
  showCharts: boolean;
  showGoals: boolean;
  displayName: string | null;
};

export default function SharePage() {
  const [profile, setProfile] = useState<ShareProfile | null>(null);

  async function load() {
    const res = await fetch("/api/share");
    const json = await res.json();
    setProfile(json.data);
  }

  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    return () => clearTimeout(initial);
  }, []);

  async function save() {
    if (!profile) return;
    const res = await fetch("/api/share", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visibility: profile.visibility,
        showBalance: profile.showBalance,
        showIncome: profile.showIncome,
        showExpense: profile.showExpense,
        showCharts: profile.showCharts,
        showGoals: profile.showGoals,
        displayName: profile.displayName,
      }),
    });
    if (res.ok) {
      toast.success("Share settings saved");
      const json = await res.json();
      setProfile(json.data);
    }
  }

  if (!profile) return <p>Loading...</p>;

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/share/${profile.token}`
      : `/share/${profile.token}`;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-primary">
          Share dashboard
        </h1>
        <p className="text-muted-foreground">
          Public finance profile dengan permission granular. Transaksi detail tidak dibagikan by
          default.
        </p>
      </div>

      <Card className="border-border/60 bg-white/70 shadow-none">
        <CardHeader>
          <CardTitle>Visibility & fields</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Display name</Label>
            <Input
              value={profile.displayName ?? ""}
              onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Visibility</Label>
            <Select
              value={profile.visibility}
              onValueChange={(v) =>
                setProfile({
                  ...profile,
                  visibility: (v ?? "PRIVATE") as ShareProfile["visibility"],
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PRIVATE">Private</SelectItem>
                <SelectItem value="PUBLIC">Public</SelectItem>
                <SelectItem value="SELECTED">Selected data only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(
            [
              ["showBalance", "Show balance"],
              ["showIncome", "Show income totals"],
              ["showExpense", "Show expense totals"],
              ["showCharts", "Show charts"],
              ["showGoals", "Show goals"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 text-sm">
              <Checkbox
                checked={profile[key]}
                onCheckedChange={(c: boolean | "indeterminate") =>
                  setProfile({ ...profile, [key]: c === true })
                }
              />
              {label}
            </label>
          ))}

          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <div className="mb-1 text-muted-foreground">Public link</div>
            <code className="break-all">{url}</code>
          </div>

          <div className="flex gap-2">
            <Button onClick={save}>Save</Button>
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(url);
                toast.success("Link copied");
              }}
            >
              Copy link
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
