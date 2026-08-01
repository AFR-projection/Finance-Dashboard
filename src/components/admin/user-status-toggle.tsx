"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";

type Props = {
  userId: string;
  status: "ACTIVE" | "SUSPENDED";
  disabled?: boolean;
};

export function UserStatusToggle({ userId, status, disabled }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suspended = status === "SUSPENDED";

  async function toggle() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: suspended ? "activate" : "suspend" }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "Gagal memperbarui.");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("Gagal terhubung ke server.");
    } finally {
      setBusy(false);
    }
  }

  if (disabled) {
    return <span className="text-xs text-ink-muted">—</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy || pending}
        className={`inline-flex h-9 min-w-11 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-brand-glow/40 disabled:opacity-60 ${
          suspended
            ? "border-brand-glow/40 text-brand-glow hover:bg-brand-glow/10"
            : "border-ink-border text-ink-muted hover:text-rose-300"
        }`}
      >
        {busy || pending ? (
          <Loader2 aria-hidden className="size-3.5 animate-spin" />
        ) : suspended ? (
          <ShieldCheck aria-hidden className="size-3.5" strokeWidth={2.2} />
        ) : (
          <ShieldOff aria-hidden className="size-3.5" strokeWidth={2.2} />
        )}
        {suspended ? "Aktifkan" : "Tangguhkan"}
      </button>
      {error && (
        <span role="alert" className="text-[11px] text-rose-300">
          {error}
        </span>
      )}
    </div>
  );
}
