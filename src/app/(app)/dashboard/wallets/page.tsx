"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Wallet = {
  id: string;
  name: string;
  currency: string;
  color: string | null;
  isDefault: boolean;
  isActive: boolean;
  balance: number;
  createdAt: string;
};

const CURRENCY_PRESETS = ["IDR", "USD", "SGD", "EUR", "MYR", "JPY", "GBP", "AUD"];
const COLOR_PRESETS = ["#0F766E", "#0369A1", "#B45309", "#BE123C", "#6D28D9", "#15803D", "#0E7490", "#57534E"];

function formatBalance(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "IDR" ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("id-ID")}`;
  }
}

type WalletFormData = { name: string; currency: string; color: string; isDefault: boolean };

function WalletForm({
  initial,
  onSubmit,
  loading,
}: {
  initial?: Partial<WalletFormData>;
  onSubmit: (data: WalletFormData) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<WalletFormData>({
    name: initial?.name ?? "",
    currency: initial?.currency ?? "IDR",
    color: initial?.color ?? "#0F766E",
    isDefault: initial?.isDefault ?? false,
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Nama Rekening</Label>
        <Input
          placeholder="BCA, Jenius, Cash USD..."
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Mata Uang</Label>
        <div className="flex flex-wrap gap-2">
          {CURRENCY_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setForm({ ...form, currency: c })}
              className={`rounded-md border px-3 py-1 text-sm font-medium transition-colors ${
                form.currency === c
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <Input
          placeholder="Kode lain, misal THB"
          value={CURRENCY_PRESETS.includes(form.currency) ? "" : form.currency}
          onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase().slice(0, 3) })}
          className="mt-2"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Warna</Label>
        <div className="flex gap-2">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setForm({ ...form, color: c })}
              className={`size-7 rounded-full border-2 transition-transform ${
                form.color === c ? "scale-125 border-foreground" : "border-transparent"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isDefault"
          checked={form.isDefault}
          onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
          className="size-4"
        />
        <Label htmlFor="isDefault">Jadikan rekening utama</Label>
      </div>

      <Button
        className="w-full"
        disabled={!form.name || form.currency.length !== 3 || loading}
        onClick={() => onSubmit(form)}
      >
        {loading ? "Menyimpan..." : "Simpan"}
      </Button>
    </div>
  );
}

export default function WalletsPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Wallet | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/wallets");
    const json = (await res.json()) as { data?: Wallet[] };
    setWallets(json.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, []);

  async function handleCreate(data: WalletFormData) {
    setSubmitting(true);
    await fetch("/api/wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setAddOpen(false);
    setSubmitting(false);
    void load();
  }

  async function handleUpdate(data: WalletFormData) {
    if (!editTarget) return;
    setSubmitting(true);
    await fetch(`/api/wallets/${editTarget.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setEditTarget(null);
    setSubmitting(false);
    void load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Nonaktifkan rekening ini? Transaksi lama tetap tersimpan.")) return;
    await fetch(`/api/wallets/${id}`, { method: "DELETE" });
    void load();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Rekening</h1>
          <p className="text-sm text-muted-foreground">Kelola akun keuangan per mata uang</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-2 size-4" />
            Tambah
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rekening Baru</DialogTitle>
            </DialogHeader>
            <WalletForm onSubmit={handleCreate} loading={submitting} />
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Memuat...</p>
      ) : wallets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Belum ada rekening. Tambah rekening IDR, USD, atau mata uang lainnya.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {wallets.map((w) => (
            <Card key={w.id} className="relative overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 w-1"
                style={{ backgroundColor: w.color ?? "#0F766E" }}
              />
              <CardHeader className="pb-2 pl-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{w.name}</CardTitle>
                    {w.isDefault && <Star className="size-3.5 fill-amber-400 text-amber-400" />}
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {w.currency}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pb-4 pl-5">
                <p className="text-2xl font-semibold tabular-nums">
                  {formatBalance(w.balance, w.currency)}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditTarget(w)}>
                    <Pencil className="mr-1 size-3.5" />
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void handleDelete(w.id)}>
                    <Trash2 className="mr-1 size-3.5" />
                    Nonaktifkan
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editTarget !== null} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Rekening</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <WalletForm
              key={editTarget.id}
              initial={{
                name: editTarget.name,
                currency: editTarget.currency,
                color: editTarget.color ?? "#0F766E",
                isDefault: editTarget.isDefault,
              }}
              onSubmit={handleUpdate}
              loading={submitting}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
