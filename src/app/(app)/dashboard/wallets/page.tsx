"use client";

import { useEffect, useState } from "react";
import { EyeOff, Pencil, Plus, Star, Trash2, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

type WalletFormData = {
  name: string;
  currency: string;
  color: string;
  isDefault: boolean;
  initialBalance?: number;
};

function WalletForm({
  initial,
  onSubmit,
  loading,
  showInitialBalance = false,
}: {
  initial?: Partial<WalletFormData>;
  onSubmit: (data: WalletFormData) => void;
  loading: boolean;
  showInitialBalance?: boolean;
}) {
  const [form, setForm] = useState<WalletFormData>({
    name: initial?.name ?? "",
    currency: initial?.currency ?? "IDR",
    color: initial?.color ?? "#0F766E",
    isDefault: initial?.isDefault ?? false,
  });
  const [balanceText, setBalanceText] = useState("");

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
              className={`min-h-9 cursor-pointer rounded-md border px-3 py-1 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/60 ${
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
              aria-label={`Warna ${c}`}
              className={`size-8 cursor-pointer rounded-full border-2 outline-none transition-transform focus-visible:ring-3 focus-visible:ring-ring/60 ${
                form.color === c ? "scale-125 border-foreground" : "border-transparent"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {showInitialBalance && (
        <div className="space-y-1.5">
          <Label>Saldo Awal (opsional)</Label>
          <Input
            inputMode="decimal"
            placeholder={`Jumlah dalam ${form.currency}`}
            value={balanceText}
            onChange={(e) => setBalanceText(e.target.value.replace(/[^0-9.]/g, ""))}
          />
          <p className="text-xs text-muted-foreground">
            Diisi dalam {form.currency}, tanpa konversi mata uang.
          </p>
        </div>
      )}

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
        onClick={() => {
          const parsed = Number.parseFloat(balanceText);
          onSubmit({
            ...form,
            initialBalance:
              showInitialBalance && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
          });
        }}
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

  async function handleDeactivate(wallet: Wallet) {
    if (!confirm(`Nonaktifkan "${wallet.name}"? Transaksi lama tetap tersimpan.`)) return;
    const res = await fetch(`/api/wallets/${wallet.id}`, { method: "DELETE" });
    const json = await res.json();
    if (!json.ok) {
      toast.error(json.error?.message ?? "Gagal menonaktifkan");
      return;
    }
    toast.success(`"${wallet.name}" dinonaktifkan`);
    void load();
  }

  /** Permanent removal, offered only where it cannot destroy ledger history. */
  async function handlePurge(wallet: Wallet) {
    if (!confirm(`Hapus permanen "${wallet.name}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    const res = await fetch(`/api/wallets/${wallet.id}?purge=1`, { method: "DELETE" });
    const json = await res.json();
    if (!json.ok) {
      toast.error(json.error?.message ?? "Gagal menghapus");
      return;
    }
    toast.success(`"${wallet.name}" dihapus permanen`);
    void load();
  }

  const active = wallets.filter((w) => w.isActive);
  const inactive = wallets.filter((w) => !w.isActive);

  // Balances never cross currencies — a single "total" across IDR and USD would
  // be a fiction, so each currency gets its own line.
  const byCurrency = Array.from(
    active
      .reduce((map, wallet) => {
        const entry = map.get(wallet.currency) ?? { total: 0, count: 0 };
        entry.total += wallet.balance;
        entry.count += 1;
        map.set(wallet.currency, entry);
        return map;
      }, new Map<string, { total: number; count: number }>())
      .entries(),
  ).sort((a, b) => b[1].total - a[1].total);

  function walletCard(wallet: Wallet) {
    const dimmed = !wallet.isActive;
    return (
      <li key={wallet.id}>
        <div
          className={`app-surface relative overflow-hidden rounded-3xl p-5 transition-all duration-200 hover:-translate-y-1 ${
            dimmed ? "opacity-60" : ""
          }`}
        >
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-1"
            style={{ backgroundColor: wallet.color ?? "#0F766E" }}
          />

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-sm font-bold text-foreground">
                {wallet.name}
                {wallet.isDefault && (
                  <Star
                    aria-label="Rekening utama"
                    className="size-3.5 shrink-0 fill-amber-400 text-amber-400"
                  />
                )}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {dimmed ? "Nonaktif" : "Aktif"}
              </p>
            </div>
            <Badge variant="secondary" className="shrink-0">
              {wallet.currency}
            </Badge>
          </div>

          <p className="tabular-money mt-5 text-2xl font-bold tracking-[-0.02em] text-foreground">
            {formatBalance(wallet.balance, wallet.currency)}
          </p>

          <div className="mt-5 flex flex-wrap gap-1 border-t border-border/50 pt-3">
            <Button
              size="sm"
              variant="ghost"
              className="cursor-pointer rounded-lg"
              onClick={() => setEditTarget(wallet)}
            >
              <Pencil className="mr-1 size-3.5" />
              Ubah
            </Button>
            {wallet.isActive ? (
              <Button
                size="sm"
                variant="ghost"
                className="cursor-pointer rounded-lg"
                onClick={() => void handleDeactivate(wallet)}
              >
                <EyeOff className="mr-1 size-3.5" />
                Nonaktifkan
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="cursor-pointer rounded-lg text-destructive hover:text-destructive"
                onClick={() => void handlePurge(wallet)}
              >
                <Trash2 className="mr-1 size-3.5" />
                Hapus permanen
              </Button>
            )}
          </div>
        </div>
      </li>
    );
  }

  return (
    <div className="space-y-5 pb-10 pt-2 lg:pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="app-eyebrow">Rekening</p>
          <h1 className="app-page-title mt-1.5">Rekening</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Saldo terpisah per rekening dan per mata uang.
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger
            render={<Button className="h-11 cursor-pointer rounded-2xl px-4 text-sm font-semibold" />}
          >
            <Plus className="size-4" strokeWidth={2.4} />
            Tambah rekening
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rekening Baru</DialogTitle>
            </DialogHeader>
            <WalletForm onSubmit={handleCreate} loading={submitting} showInitialBalance />
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-48 rounded-3xl" />
          ))}
        </div>
      ) : wallets.length === 0 ? (
        <div className="app-surface rounded-3xl p-10 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-secondary text-primary">
            <WalletCards aria-hidden className="size-7" strokeWidth={1.8} />
          </span>
          <h2 className="mt-5 text-lg font-bold tracking-[-0.02em] text-foreground">
            Belum ada rekening
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Tambahkan rekening bank, e-wallet, atau uang tunai. Transaksi, budget, dan target
            tabungan semuanya menempel ke rekening.
          </p>
          <Button
            className="mt-6 h-11 cursor-pointer rounded-2xl px-6 text-sm font-semibold"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="size-4" strokeWidth={2.4} />
            Buat rekening pertama
          </Button>
        </div>
      ) : (
        <>
          {byCurrency.length > 0 && (
            <section
              aria-label="Total aset per mata uang"
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              {byCurrency.map(([currency, sum]) => (
                <div key={currency} className="app-surface rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                      Total {currency}
                    </p>
                    <span className="text-[10px] text-muted-foreground">
                      {sum.count} rekening
                    </span>
                  </div>
                  <p className="tabular-money mt-2 text-xl font-bold tracking-[-0.02em] text-foreground">
                    {formatBalance(sum.total, currency)}
                  </p>
                </div>
              ))}
            </section>
          )}

          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{active.map(walletCard)}</ul>

          {inactive.length > 0 && (
            <section>
              <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Nonaktif ({inactive.length})
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {inactive.map(walletCard)}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                Rekening nonaktif bisa dihapus permanen selama belum punya transaksi.
              </p>
            </section>
          )}
        </>
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
