"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, Download, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Tx = {
  id: string;
  type: "INCOME" | "EXPENSE";
  amount: number;
  description: string;
  transactionDate: string;
  category: { name: string; color: string } | null;
  wallet: { id: string; name: string; currency: string } | null;
  channel: string;
};

type WalletOption = { id: string; name: string; currency: string; isDefault: boolean };

type FormState = {
  id?: string;
  type: "INCOME" | "EXPENSE";
  amount: string;
  category: string;
  description: string;
  transactionDate: string;
  walletId: string;
};

const NO_WALLET = "NONE";

const emptyForm = (): FormState => ({
  type: "EXPENSE",
  amount: "",
  category: "Food",
  description: "",
  transactionDate: new Date().toISOString().slice(0, 10),
  walletId: NO_WALLET,
});

export default function TransactionsPage() {
  const [items, setItems] = useState<Tx[]>([]);
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>("ALL");
  const [walletFilter, setWalletFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [period, setPeriod] = useState<string>("30");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (type !== "ALL") params.set("type", type);
    if (walletFilter !== "ALL") params.set("walletId", walletFilter);
    if (categoryFilter !== "ALL") params.set("categoryId", categoryFilter);
    if (period !== "ALL") {
      const from = new Date();
      from.setUTCDate(from.getUTCDate() - Number(period));
      params.set("from", from.toISOString().slice(0, 10));
    }
    params.set("limit", "100");
    const res = await fetch(`/api/transactions?${params}`);
    const json = await res.json();
    setItems(json.data?.items ?? []);
    setLoading(false);
  }

  const activeFilters =
    (type !== "ALL" ? 1 : 0) +
    (walletFilter !== "ALL" ? 1 : 0) +
    (categoryFilter !== "ALL" ? 1 : 0) +
    (period !== "30" ? 1 : 0) +
    (search ? 1 : 0);

  function resetFilters() {
    setSearch("");
    setType("ALL");
    setWalletFilter("ALL");
    setCategoryFilter("ALL");
    setPeriod("30");
  }

  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    void fetch("/api/wallets")
      .then((r) => r.json())
      .then((j: { data?: WalletOption[] }) =>
        setWallets((j.data ?? []).filter((w) => (w as { isActive?: boolean }).isActive !== false)),
      );
    void fetch("/api/categories")
      .then((r) => r.json())
      .then((j: { data?: Array<{ id: string; name: string }> }) => setCategories(j.data ?? []));
    return () => clearTimeout(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function remove(id: string) {
    await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((t) => t.id !== id));
    toast.success("Transaksi dihapus");
  }

  function openCreate() {
    if (wallets.length === 0) {
      toast.error("Buat rekening terlebih dahulu sebelum menambah transaksi");
      return;
    }
    const preset = emptyForm();
    const fallback = wallets.find((w) => w.isDefault) ?? wallets[0];
    setForm(fallback ? { ...preset, walletId: fallback.id } : preset);
    setOpen(true);
  }

  function openEdit(t: Tx) {
    setForm({
      id: t.id,
      type: t.type,
      amount: String(t.amount),
      category: t.category?.name ?? "Other",
      description: t.description,
      transactionDate: new Date(t.transactionDate).toISOString().slice(0, 10),
      walletId: t.wallet?.id ?? NO_WALLET,
    });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      type: form.type,
      amount: Number(form.amount),
      category: form.category,
      description: form.description,
      transactionDate: form.transactionDate,
      channel: "WEB" as const,
      ...(form.walletId !== NO_WALLET ? { walletId: form.walletId } : {}),
    };

    const res = form.id
      ? await fetch(`/api/transactions/${form.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    if (!res.ok) {
      toast.error("Gagal menyimpan transaksi");
      return;
    }
    toast.success(form.id ? "Transaksi diperbarui" : "Transaksi ditambahkan");
    setOpen(false);
    load();
  }

  function exportCsv() {
    const header = "date,type,amount,currency,wallet,category,description,channel\n";
    const rows = items
      .map(
        (t) =>
          `${new Date(t.transactionDate).toISOString().slice(0, 10)},${t.type},${t.amount},${t.wallet?.currency ?? ""},"${t.wallet?.name ?? ""}",${t.category?.name ?? ""},"${t.description}",${t.channel}`,
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transactions.csv";
    a.click();
  }

  // Currencies are never converted, so a single net figure would be meaningless.
  const summary = useMemo(() => {
    const totals = new Map<string, { income: number; expense: number }>();
    for (const t of items) {
      const currency = t.wallet?.currency ?? "IDR";
      const entry = totals.get(currency) ?? { income: 0, expense: 0 };
      if (t.type === "INCOME") entry.income += t.amount;
      else entry.expense += t.amount;
      totals.set(currency, entry);
    }
    return [...totals.entries()].map(([currency, v]) => ({
      currency,
      income: v.income,
      expense: v.expense,
      net: v.income - v.expense,
    }));
  }, [items]);

  return (
    <div className="space-y-5 pt-1 lg:space-y-6 lg:pt-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="app-eyebrow mb-1">Money activity</p>
          <h1 className="app-page-title">Transaksi</h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">Semua arus uang dalam satu timeline.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="icon-lg" className="app-surface rounded-xl" onClick={exportCsv} aria-label="Export CSV">
            <Download className="size-4" />
          </Button>
          <Button size="lg" className="rounded-xl px-3" onClick={openCreate}><Plus className="size-4" /><span className="hidden sm:inline">Tambah</span></Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-h-[92svh] overflow-y-auto rounded-[1.5rem] max-sm:bottom-0 max-sm:top-auto max-sm:translate-y-0">
              <DialogHeader>
                <DialogTitle>{form.id ? "Edit transaksi" : "Tambah transaksi"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={save} className="space-y-3">
                <div className="space-y-1">
                  <Label>Tipe</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        type: (v ?? "EXPENSE") as "INCOME" | "EXPENSE",
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EXPENSE">Expense</SelectItem>
                      <SelectItem value="INCOME">Income</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Jumlah</Label>
                  <Input
                    type="number"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Kategori</Label>
                  <Input
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Deskripsi</Label>
                  <Input
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Rekening</Label>
                  <Select
                    value={form.walletId}
                    onValueChange={(v) => setForm((f) => ({ ...f, walletId: v ?? NO_WALLET }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {wallets.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name} · {w.currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Tanggal</Label>
                  <Input
                    type="date"
                    value={form.transactionDate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, transactionDate: e.target.value }))
                    }
                    required
                  />
                </div>
                <Button type="submit" className="h-11 w-full rounded-xl" disabled={form.walletId === NO_WALLET}>
                  Simpan
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <section aria-label="Filter transaksi" className="app-surface rounded-2xl p-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search
              aria-hidden
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Cari deskripsi transaksi…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void load();
              }}
              aria-label="Cari transaksi"
              className="h-10 border-0 bg-muted/55 pl-9 shadow-none"
            />
          </div>
          <div className="flex gap-2">
            <Button
              className="h-10 flex-1 cursor-pointer rounded-xl sm:flex-none"
              onClick={() => void load()}
            >
              Terapkan
            </Button>
            {activeFilters > 0 && (
              <Button
                variant="outline"
                className="h-10 cursor-pointer rounded-xl"
                onClick={resetFilters}
              >
                <X className="size-3.5" strokeWidth={2.4} />
                Reset
              </Button>
            )}
          </div>
        </div>

        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            aria-label="Periode"
            className="h-10 cursor-pointer rounded-xl border border-input bg-card px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
          >
            <option value="30">30 hari terakhir</option>
            <option value="7">7 hari terakhir</option>
            <option value="90">90 hari terakhir</option>
            <option value="ALL">Semua waktu</option>
          </select>

          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label="Tipe transaksi"
            className="h-10 cursor-pointer rounded-xl border border-input bg-card px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
          >
            <option value="ALL">Semua tipe</option>
            <option value="INCOME">Masuk</option>
            <option value="EXPENSE">Keluar</option>
          </select>

          <select
            value={walletFilter}
            onChange={(e) => setWalletFilter(e.target.value)}
            aria-label="Rekening"
            className="h-10 cursor-pointer rounded-xl border border-input bg-card px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
          >
            <option value="ALL">Semua rekening</option>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} · {w.currency}
              </option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Kategori"
            className="h-10 cursor-pointer rounded-xl border border-input bg-card px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
          >
            <option value="ALL">Semua kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Totals are per currency: rupiah and dollars are never summed together. */}
      {summary.length > 0 && (
        <section aria-label="Ringkasan hasil filter" className="grid gap-3 sm:grid-cols-3">
          {summary.map((row) => (
            <div key={row.currency} className="app-surface rounded-2xl p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {row.currency}
              </p>
              <p
                className={`tabular-money mt-1.5 text-lg font-bold tracking-[-0.02em] ${
                  row.net < 0 ? "text-destructive" : "text-foreground"
                }`}
              >
                {row.net >= 0 ? "+" : ""}
                {formatCurrency(row.net, row.currency)}
              </p>
              <div className="mt-2 flex gap-4 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <ArrowDownLeft aria-hidden className="size-3 text-emerald-600" strokeWidth={2.4} />
                  {formatCurrency(row.income, row.currency)}
                </span>
                <span className="flex items-center gap-1">
                  <ArrowUpRight aria-hidden className="size-3 text-amber-600" strokeWidth={2.4} />
                  {formatCurrency(row.expense, row.currency)}
                </span>
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="app-surface hidden overflow-hidden rounded-2xl md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Rekening</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={7}>Loading...</TableCell>
              </TableRow>
            )}
            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center">
                  <p className="text-sm text-muted-foreground">
                    {activeFilters > 0
                      ? "Tidak ada transaksi yang cocok dengan filter."
                      : "Belum ada transaksi."}
                  </p>
                  <Button
                    variant="outline"
                    className="mt-3 h-9 cursor-pointer rounded-xl"
                    onClick={activeFilters > 0 ? resetFilters : openCreate}
                  >
                    {activeFilters > 0 ? "Reset filter" : "Tambah transaksi"}
                  </Button>
                </TableCell>
              </TableRow>
            )}
            {items.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{new Date(t.transactionDate).toLocaleDateString("id-ID")}</TableCell>
                <TableCell>
                  <Badge variant={t.type === "INCOME" ? "secondary" : "outline"}>{t.type}</Badge>
                </TableCell>
                <TableCell>{t.category?.name ?? "—"}</TableCell>
                <TableCell>
                  {t.wallet ? (
                    <Badge variant="secondary">{t.wallet.name} · {t.wallet.currency}</Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>{t.description}</TableCell>
                <TableCell className="text-right font-medium">
                  {t.type === "EXPENSE" ? "-" : "+"}
                  {formatCurrency(t.amount, t.wallet?.currency ?? "IDR")}
                </TableCell>
                <TableCell className="space-x-1 text-right">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(t.id)}>
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="space-y-2.5 md:hidden">
        {loading && <div className="app-surface rounded-2xl p-4 text-xs text-muted-foreground">Memuat transaksi...</div>}
        {!loading && items.length === 0 && (
          <div className="app-surface rounded-2xl p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {activeFilters > 0
                ? "Tidak ada transaksi yang cocok dengan filter."
                : "Belum ada transaksi."}
            </p>
            <Button
              variant="outline"
              className="mt-3 h-10 cursor-pointer rounded-xl"
              onClick={activeFilters > 0 ? resetFilters : openCreate}
            >
              {activeFilters > 0 ? "Reset filter" : "Tambah transaksi"}
            </Button>
          </div>
        )}
        {items.map((transaction) => {
          const income = transaction.type === "INCOME";
          return (
            <div key={transaction.id} className="app-surface flex items-center gap-3 rounded-2xl p-3.5">
              <span className={`grid size-10 shrink-0 place-items-center rounded-2xl ${income ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}`}>
                {income ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
              </span>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openEdit(transaction)}>
                <p className="truncate text-xs font-semibold">{transaction.description}</p>
                <p className="mt-1 truncate text-[10px] text-muted-foreground">{transaction.category?.name ?? "Lainnya"} · {transaction.wallet?.name ?? "Tanpa rekening"} · {new Date(transaction.transactionDate).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</p>
              </button>
              <div className="text-right">
                <p className={`tabular-money text-xs font-bold ${income ? "text-emerald-700" : "text-foreground"}`}>{income ? "+" : "-"}{formatCurrency(transaction.amount, transaction.wallet?.currency ?? "IDR")}</p>
                <div className="mt-1 flex justify-end gap-0.5">
                  <Button variant="ghost" size="icon-xs" onClick={() => openEdit(transaction)} aria-label="Edit"><Pencil className="size-3" /></Button>
                  <Button variant="ghost" size="icon-xs" className="text-destructive" onClick={() => void remove(transaction.id)} aria-label="Hapus"><Trash2 className="size-3" /></Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Menampilkan {items.length} transaksi{activeFilters > 0 ? " (terfilter)" : ""}.
      </p>
    </div>
  );
}
