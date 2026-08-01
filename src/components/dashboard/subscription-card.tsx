"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";

type Status = {
  tier: "FREE" | "PREMIUM";
  quota: number;
  used: number;
  remaining: number | null;
  unlimited: boolean;
  daysLeft: number;
  priceIdr: number;
  paymentsEnabled: boolean;
};

declare global {
  interface Window {
    snap?: {
      pay: (
        token: string,
        callbacks: {
          onSuccess?: () => void;
          onPending?: () => void;
          onError?: () => void;
          onClose?: () => void;
        },
      ) => void;
    };
  }
}

/** Snap is loaded on demand so the dashboard does not pay for it on every visit. */
function loadSnap(clientKey: string, isProduction: boolean): Promise<void> {
  if (window.snap) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = isProduction
      ? "https://app.midtrans.com/snap/snap.js"
      : "https://app.sandbox.midtrans.com/snap/snap.js";
    script.setAttribute("data-client-key", clientKey);
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("snap gagal dimuat"));
    document.body.appendChild(script);
  });
}

export function SubscriptionCard() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/subscription");
    const json = await res.json();
    if (json.ok) setStatus(json.data);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function upgrade() {
    setBusy(true);
    try {
      const res = await fetch("/api/payments/checkout", { method: "POST" });
      const json = await res.json();
      if (!json.ok || !json.data?.token) {
        toast.error(json.error?.message || "Gagal memulai pembayaran.");
        return;
      }

      await loadSnap(json.data.clientKey, json.data.isProduction);
      window.snap?.pay(json.data.token, {
        // The webhook is what actually grants Premium; this only refreshes the UI.
        onSuccess: () => {
          toast.success("Pembayaran diterima. Premium sedang diaktifkan…");
          setTimeout(() => {
            void refresh();
            router.refresh();
          }, 2000);
        },
        onPending: () => toast.info("Menunggu pembayaran selesai."),
        onError: () => toast.error("Pembayaran gagal."),
      });
    } catch {
      toast.error("Gagal terhubung ke layanan pembayaran.");
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  const isPremium = status.tier === "PREMIUM";
  const pct =
    status.unlimited || status.quota === 0
      ? 0
      : Math.min(100, Math.round((status.used / status.quota) * 100));
  const nearLimit = !status.unlimited && pct >= 80;

  return (
    <div className="app-surface rounded-[1.4rem] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold text-foreground">
            {isPremium ? (
              <Sparkles aria-hidden className="size-4 text-primary" strokeWidth={2.2} />
            ) : (
              <Zap aria-hidden className="size-4 text-muted-foreground" strokeWidth={2.2} />
            )}
            {isPremium ? "Premium" : "Paket Gratis"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isPremium
              ? `Aktif ${status.daysLeft} hari lagi`
              : "Fitur pencatatan terbuka penuh, kuota AI terbatas"}
          </p>
        </div>

        {!isPremium && status.paymentsEnabled && (
          <button
            type="button"
            onClick={() => void upgrade()}
            disabled={busy}
            className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground outline-none transition-all hover:-translate-y-0.5 hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/60 disabled:opacity-60"
          >
            {busy ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : null}
            Upgrade {new Intl.NumberFormat("id-ID", {
              style: "currency",
              currency: "IDR",
              maximumFractionDigits: 0,
            }).format(status.priceIdr)}
          </button>
        )}
      </div>

      {!status.unlimited && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Kuota AI bulan ini</span>
            <span className="tabular-money">
              {status.used.toLocaleString("id-ID")} / {status.quota.toLocaleString("id-ID")}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border">
            <div
              className={`h-full rounded-full transition-all ${
                nearLimit ? "bg-destructive" : "bg-primary"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {nearLimit && (
            <p className="mt-2 text-[11px] text-destructive">
              {pct >= 100
                ? "Kuota habis. Upgrade untuk melanjutkan pakai AI."
                : "Kuota hampir habis."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
