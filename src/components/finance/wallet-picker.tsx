"use client";

import Link from "next/link";
import { WalletCards } from "lucide-react";

export type WalletOption = {
  id: string;
  name: string;
  currency: string;
  balance: number;
  isActive: boolean;
  isDefault: boolean;
  color?: string | null;
};

/**
 * Budgets and goals are meaningless without an account: a "500k limit" has no
 * currency until you say which wallet it draws from. Both pages therefore lead
 * with this instead of an empty form.
 */
export function NoWalletState({ what }: { what: string }) {
  return (
    <div className="app-surface rounded-3xl p-10 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-secondary text-primary">
        <WalletCards aria-hidden className="size-7" strokeWidth={1.8} />
      </span>
      <h2 className="mt-5 text-lg font-bold tracking-[-0.02em] text-foreground">
        Tambah rekening dulu
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {what} selalu menempel ke satu rekening supaya mata uang dan sisa saldonya jelas. Buat
        rekening pertama kamu untuk mulai.
      </p>
      <Link
        href="/dashboard/wallets"
        className="mt-6 inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-6 text-sm font-semibold text-primary-foreground outline-none transition-all hover:-translate-y-0.5 hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        Buat rekening
      </Link>
    </div>
  );
}

export function WalletPicker({
  wallets,
  value,
  onChange,
  id = "walletId",
  label = "Rekening",
}: {
  wallets: WalletOption[];
  value: string;
  onChange: (id: string) => void;
  id?: string;
  label?: string;
}) {
  const selected = wallets.find((w) => w.id === value);

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full cursor-pointer rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        <option value="">Pilih rekening…</option>
        {wallets.map((wallet) => (
          <option key={wallet.id} value={wallet.id}>
            {wallet.name} · {wallet.currency}
          </option>
        ))}
      </select>
      {selected && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Nominal dihitung dalam{" "}
          <span className="font-semibold text-foreground">{selected.currency}</span>
        </p>
      )}
    </div>
  );
}
