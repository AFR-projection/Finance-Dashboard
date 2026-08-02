"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";

/**
 * Grants one Premium period without a Midtrans payment.
 *
 * `days` is only the label: the route reads the configured period itself, so a
 * stale page cannot hand out the wrong duration.
 */
export function ManualActivateButton({ userId, days = 30 }: { userId: string; days?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function activate() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "Gagal mengaktifkan.");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("Gagal terhubung ke server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void activate()}
        disabled={busy || pending}
        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-brand-glow/40 px-3 text-xs font-semibold text-brand-glow outline-none transition-colors hover:bg-brand-glow/10 focus-visible:ring-3 focus-visible:ring-brand-glow/40 disabled:opacity-60"
      >
        {busy || pending ? (
          <Loader2 aria-hidden className="size-3.5 animate-spin" />
        ) : (
          <Sparkles aria-hidden className="size-3.5" strokeWidth={2.2} />
        )}
        +{days} hari
      </button>
      {error && (
        <span role="alert" className="text-[11px] text-rose-300">
          {error}
        </span>
      )}
    </div>
  );
}
