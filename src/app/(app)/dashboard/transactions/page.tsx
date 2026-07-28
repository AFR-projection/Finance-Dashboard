"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>("ALL");
  const [walletFilter, setWalletFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (type !== "ALL") params.set("type", type);
    if (walletFilter !== "ALL") params.set("walletId", walletFilter);
    params.set("limit", "100");
    const res = await fetch(`/api/transactions?${params}`);
    const json = await res.json();
    setItems(json.data?.items ?? []);
    setLoading(false);
  }

  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    void fetch("/api/wallets")
      .then((r) => r.json())
      .then((j: { data?: WalletOption[] }) => setWallets(j.data ?? []));
    return () => clearTimeout(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function remove(id: string) {
    await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((t) => t.id !== id));
    toast.success("Transaksi dihapus");
  }

  function openCreate() {
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
  const netByCurrency = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const t of items) {
      const currency = t.wallet?.currency ?? "IDR";
      totals[currency] = (totals[currency] ?? 0) + (t.type === "INCOME" ? t.amount : -t.amount);
    }
    return Object.entries(totals);
  }, [items]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl text-primary">
            Transactions
          </h1>
          <p className="text-muted-foreground">Cari, filter, edit, dan export riwayat.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}>
            Export CSV
          </Button>
          <Button onClick={openCreate}>Tambah</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
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
                      <SelectItem value={NO_WALLET}>Tanpa rekening</SelectItem>
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
                <Button type="submit" className="w-full">
                  Simpan
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs bg-white/80"
        />
        <Select value={type} onValueChange={(v) => setType(v ?? "ALL")}>
          <SelectTrigger className="w-40 bg-white/80">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value="INCOME">Income</SelectItem>
            <SelectItem value="EXPENSE">Expense</SelectItem>
          </SelectContent>
        </Select>
        <Select value={walletFilter} onValueChange={(v) => setWalletFilter(v ?? "ALL")}>
          <SelectTrigger className="w-48 bg-white/80">
            <SelectValue placeholder="Rekening" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Semua rekening</SelectItem>
            {wallets.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name} · {w.currency}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={load}>Apply</Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-white/70">
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
                <TableCell colSpan={7}>Belum ada transaksi.</TableCell>
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
      <p className="text-sm text-muted-foreground">
        Net on page:{" "}
        {netByCurrency.length === 0
          ? "—"
          : netByCurrency.map(([c, v]) => formatCurrency(v, c)).join(" · ")}
      </p>
    </div>
  );
}
