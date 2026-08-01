"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  BadgeCheck,
  Check,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

type Settings = {
  username: string | null;
  name: string | null;
  telegramChatId: string | null;
  memberSince: string | null;
  botUsername: string | null;
  tier: "FREE" | "PREMIUM";
  quota: number;
  used: number;
  unlimited: boolean;
  daysLeft: number;
  priceIdr: number;
  paymentsEnabled: boolean;
};

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

export default function SettingsPage() {
  const [data, setData] = useState<Settings | null>(null);
  const [chatId, setChatId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/settings");
    const json = await res.json();
    if (json.ok) {
      setData(json.data);
      setChatId(json.data.telegramChatId ?? "");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveChatId(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: chatId.trim() }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error?.message ?? "Gagal menyimpan.");
        return;
      }
      toast.success("Telegram tertaut");
      void load();
    } catch {
      setError("Gagal terhubung ke server.");
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 pt-2 lg:pt-8">
        <Skeleton className="h-9 w-40 rounded-xl" />
        <Skeleton className="h-44 rounded-3xl" />
        <Skeleton className="h-56 rounded-3xl" />
      </div>
    );
  }

  const isPremium = data.tier === "PREMIUM";
  const pct = data.unlimited || data.quota === 0
    ? 0
    : Math.min(100, Math.round((data.used / data.quota) * 100));
  const changed = chatId.trim() !== (data.telegramChatId ?? "");

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-10 pt-2 lg:pt-8">
      <div>
        <p className="app-eyebrow">Akun</p>
        <h1 className="app-page-title mt-1.5">Pengaturan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Kelola Telegram yang tertaut dan lihat status langgananmu.
        </p>
      </div>

      {/* ---- Status akun ---- */}
      <section
        className={`relative overflow-hidden rounded-3xl p-6 ${
          isPremium ? "mk-ink vault-noise" : "app-surface"
        }`}
      >
        {isPremium && <span aria-hidden className="sheen pointer-events-none absolute inset-0" />}
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p
              className={`flex items-center gap-2 text-sm font-bold ${
                isPremium ? "text-ink-foreground" : "text-foreground"
              }`}
            >
              {isPremium ? (
                <Sparkles aria-hidden className="size-4 text-brand-glow" strokeWidth={2.2} />
              ) : (
                <Zap aria-hidden className="size-4 text-muted-foreground" strokeWidth={2.2} />
              )}
              {isPremium ? "Premium" : "Paket Gratis"}
            </p>
            <p className={`mt-1 text-xs ${isPremium ? "text-ink-muted" : "text-muted-foreground"}`}>
              {isPremium
                ? `Aktif ${data.daysLeft} hari lagi`
                : "Pencatatan penuh, kuota AI terbatas"}
            </p>
            {data.username && (
              <p
                className={`mt-3 text-xs ${isPremium ? "text-ink-muted" : "text-muted-foreground"}`}
              >
                Username <span className="font-semibold">@{data.username}</span>
              </p>
            )}
          </div>

          {!isPremium && data.paymentsEnabled && (
            <Link
              href="/dashboard"
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground outline-none transition-all hover:-translate-y-0.5 hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/60"
            >
              Upgrade {rupiah(data.priceIdr)}
              <ArrowUpRight aria-hidden className="size-3.5" strokeWidth={2.4} />
            </Link>
          )}
        </div>

        {!data.unlimited && (
          <div className="relative mt-5">
            <div
              className={`flex items-center justify-between text-[11px] ${
                isPremium ? "text-ink-muted" : "text-muted-foreground"
              }`}
            >
              <span>Kuota AI bulan ini</span>
              <span className="tabular-money">
                {data.used.toLocaleString("id-ID")} / {data.quota.toLocaleString("id-ID")}
              </span>
            </div>
            <div
              className={`mt-1.5 h-1.5 overflow-hidden rounded-full ${
                isPremium ? "bg-ink" : "bg-border"
              }`}
            >
              <div
                className={`h-full rounded-full ${
                  pct >= 80 ? "bg-destructive" : isPremium ? "bg-brand-glow" : "bg-primary"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {/* ---- Telegram ---- */}
      <section className="app-surface rounded-3xl p-6">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-secondary text-primary">
            <MessageCircle aria-hidden className="size-4.5" strokeWidth={2} />
          </span>
          <div>
            <h2 className="text-sm font-bold text-foreground">Telegram</h2>
            <p className="text-xs text-muted-foreground">
              Chat ID yang berhak mencatat ke akun ini.
            </p>
          </div>
          {data.telegramChatId && (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
              <BadgeCheck aria-hidden className="size-3.5" strokeWidth={2.4} />
              Tertaut
            </span>
          )}
        </div>

        <form onSubmit={saveChatId} className="mt-5">
          <Label htmlFor="chatId" className="text-sm font-semibold text-foreground">
            Chat ID
          </Label>
          <Input
            id="chatId"
            value={chatId}
            onChange={(e) => setChatId(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="6786845841"
            aria-describedby="chatid-help"
            className="tabular-money mt-2 h-12 rounded-xl text-base"
          />
          <p id="chatid-help" className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Kirim <span className="font-semibold text-foreground">/start</span> ke{" "}
            {data.botUsername ? (
              <a
                href={`https://t.me/${data.botUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
              >
                @{data.botUsername}
              </a>
            ) : (
              "bot Ledgerly"
            )}{" "}
            untuk melihat Chat ID kamu. Kami kirim pesan uji sebelum menyimpan — Chat ID orang lain
            akan ditolak.
          </p>

          {error && (
            <p
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={2.2} />
              {error}
            </p>
          )}

          <div className="mt-5 flex items-center gap-3">
            <Button
              type="submit"
              disabled={saving || !changed || chatId.trim().length < 5}
              className="h-11 cursor-pointer rounded-2xl px-5 text-sm font-semibold"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Memverifikasi…
                </>
              ) : (
                <>
                  <Check className="size-4" strokeWidth={2.4} /> Simpan
                </>
              )}
            </Button>
            {data.botUsername && (
              <a
                href={`https://t.me/${data.botUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-semibold text-foreground outline-none transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/60"
              >
                <Send className="size-4" strokeWidth={2.2} />
                Buka bot
              </a>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
