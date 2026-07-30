"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type State = "loading" | "unsupported" | "off" | "on" | "blocked";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function NotificationBell({ className }: { className?: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function detect() {
      const supported =
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

      if (!supported) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("blocked");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      setState(existing ? "on" : "off");
    }

    void detect().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    const permission = await Notification.requestPermission();
    if (permission === "denied") {
      setState("blocked");
      toast.error("Notifikasi diblokir di pengaturan browser.");
      return;
    }
    if (permission !== "granted") return;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
    });

    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });
    if (!res.ok) {
      await subscription.unsubscribe();
      throw new Error("subscribe failed");
    }

    setState("on");
    toast.success("Notifikasi aktif. Ledgerly akan mengabari kondisi keuanganmu.");
  }

  async function disable() {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
    }
    setState("off");
    toast.success("Notifikasi dimatikan.");
  }

  async function toggle() {
    if (state === "unsupported") {
      toast.error("Perangkat ini belum mendukung notifikasi push.");
      return;
    }
    if (state === "blocked") {
      toast.error("Izin notifikasi diblokir. Aktifkan lagi dari pengaturan situs.");
      return;
    }

    setBusy(true);
    try {
      if (state === "on") await disable();
      else await enable();
    } catch {
      toast.error("Gagal mengubah pengaturan notifikasi.");
    } finally {
      setBusy(false);
    }
  }

  const Icon = busy || state === "loading" ? Loader2 : state === "on" ? BellRing : state === "blocked" || state === "unsupported" ? BellOff : Bell;

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy || state === "loading"}
      aria-label={state === "on" ? "Matikan notifikasi" : "Aktifkan notifikasi"}
      aria-pressed={state === "on"}
      className={cn(
        "grid size-9 place-items-center rounded-xl border border-border/70 bg-card transition-colors active:scale-95",
        state === "on" ? "border-primary/25 bg-primary/5 text-primary" : "text-muted-foreground",
        className,
      )}
    >
      <Icon className={cn("size-4", (busy || state === "loading") && "animate-spin")} />
    </button>
  );
}
