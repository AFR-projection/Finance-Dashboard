"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { CheckCircle2, LoaderCircle, QrCode, Radio, RefreshCw, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type WhatsAppSession = {
  isConnected: boolean;
  phoneNumber: string | null;
  lastQr: string | null;
  updatedAt: string;
};

const QR_FRESH_MS = 75_000;
const WORKER_STALE_MS = 20_000;
const ENSURE_COOLDOWN_MS = 8_000;

function normalizePhone(value?: string | null): string {
  return value?.replace(/\D/g, "") ?? "";
}

function normalizeSession(value: WhatsAppSession | null): WhatsAppSession | null {
  if (value?.isConnected && Date.now() - new Date(value.updatedAt).getTime() > WORKER_STALE_MS) {
    return { ...value, isConnected: false, phoneNumber: null, lastQr: null };
  }
  if (!value?.lastQr) return value;
  const fresh = Date.now() - new Date(value.updatedAt).getTime() < QR_FRESH_MS;
  return fresh ? value : { ...value, lastQr: null };
}

export function WhatsAppSenderCard({ ownerPhone }: { ownerPhone?: string }) {
  const [session, setSession] = useState<WhatsAppSession | null>();
  const [userId, setUserId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [requestingQr, setRequestingQr] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const lastEnsureAt = useRef(0);
  const socketRef = useRef<Socket | null>(null);

  const applySession = useCallback((next: WhatsAppSession | null) => {
    setSession(normalizeSession(next));
    setLoadError("");
  }, []);

  const loadSession = useCallback(async () => {
    try {
      const response = await fetch("/api/channels", { cache: "no-store" });
      const json = (await response.json()) as {
        data?: { userId?: string; whatsapp?: WhatsAppSession | null };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(json.error?.message || "Gagal membaca status WhatsApp");
      if (json.data?.userId) setUserId(json.data.userId);
      applySession(json.data?.whatsapp ?? null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Gagal membaca status WhatsApp");
    }
  }, [applySession]);

  const ensureQr = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastEnsureAt.current < ENSURE_COOLDOWN_MS) return;
    lastEnsureAt.current = now;
    setRequestingQr(true);
    try {
      const response = await fetch("/api/channels/whatsapp-pairing", { method: "POST" });
      const json = (await response.json()) as {
        data?: { session?: WhatsAppSession };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(json.error?.message || "Gagal meminta QR WhatsApp");
      if (json.data?.session) applySession(json.data.session);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Gagal meminta QR WhatsApp");
    } finally {
      setRequestingQr(false);
    }
  }, [applySession]);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadSession(), 0);
    const fallbackPoll = window.setInterval(() => void loadSession(), 2_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(fallbackPoll);
    };
  }, [loadSession]);

  useEffect(() => {
    if (!userId) return;
    const socket = io({ path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("connect", () => {
      setSocketConnected(true);
      socket.emit("dashboard:join", userId);
    });
    socket.on("disconnect", () => setSocketConnected(false));
    socket.on("whatsapp:session", (next: WhatsAppSession) => applySession(next));
    return () => {
      socket.off("whatsapp:session");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [applySession, userId]);

  useEffect(() => {
    if (session === undefined || session?.isConnected || session?.lastQr) return;
    const timer = window.setTimeout(() => void ensureQr(), 300);
    return () => window.clearTimeout(timer);
  }, [ensureQr, session]);

  const senderPhone = normalizePhone(session?.phoneNumber);
  const ownerAndSenderMatch = Boolean(senderPhone && normalizePhone(ownerPhone) === senderPhone);
  const connected = Boolean(session?.isConnected);
  const qrReady = Boolean(session?.lastQr && !connected);

  return (
    <Card className="app-surface overflow-hidden rounded-[1.5rem] ring-0">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-emerald-500/10 text-emerald-700"><Radio className="size-4" /></span>
            WhatsApp Sender
          </CardTitle>
          <Badge variant="outline" className={connected ? "border-emerald-200 bg-emerald-50 text-emerald-700" : qrReady ? "border-amber-200 bg-amber-50 text-amber-700" : "border-sky-200 bg-sky-50 text-sky-700"} aria-live="polite">
            {connected ? "Terhubung" : qrReady ? "Siap dipindai" : "Menyiapkan QR"}
          </Badge>
        </div>
        <CardDescription className="leading-relaxed">
          QR dibuat langsung oleh worker Baileys dan diperbarui secara real-time. Gunakan nomor sender yang berbeda dari nomor owner.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {connected ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" />
              <div><p className="text-sm font-semibold text-emerald-950">Sender aktif</p><p className="mt-1 text-lg font-bold text-emerald-800">{senderPhone ? `+${senderPhone}` : "Nomor tersambung"}</p><p className="mt-1 text-xs text-emerald-700">Pesan owner sekarang dapat diterima dan dibalas oleh Ledgerly.</p></div>
            </div>
          </div>
        ) : qrReady ? (
          <div className="grid items-center gap-5 sm:grid-cols-[240px_1fr]">
            <div className="relative rounded-2xl border border-border/60 bg-white p-3 shadow-sm">
              {/* Generated by the trusted Baileys worker. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img key={session?.updatedAt} src={session!.lastQr!} alt="QR pairing WhatsApp sender" className="mx-auto aspect-square w-full max-w-[216px]" />
              <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-white"><span className="size-1.5 animate-pulse rounded-full bg-white" /> Live</span>
            </div>
            <div className="space-y-3 text-sm">
              <div><p className="font-semibold">Scan dari WhatsApp sender</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">WhatsApp → Perangkat tertaut → Tautkan perangkat, lalu arahkan kamera ke QR.</p></div>
              <div className="rounded-xl bg-muted/60 p-3 text-[11px] leading-relaxed text-muted-foreground">QR akan berganti otomatis saat kedaluwarsa. Halaman ini menerima pembaruan tanpa perlu refresh.</div>
              <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={requestingQr} onClick={() => void ensureQr(true)}><RefreshCw className={requestingQr ? "animate-spin" : ""} /> Buat QR baru</Button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-primary/20 bg-primary/[0.025] p-6 text-center">
            <span className="relative grid size-14 place-items-center rounded-2xl bg-primary/8 text-primary"><QrCode className="size-6" /><LoaderCircle className="absolute -right-1 -top-1 size-4 animate-spin rounded-full bg-background text-primary" /></span>
            <p className="mt-4 text-sm font-semibold">Menyiapkan QR pairing</p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">Dashboard sedang meminta sesi baru ke worker WhatsApp. QR akan muncul otomatis begitu Baileys menerbitkannya.</p>
            <Button type="button" variant="outline" size="sm" className="mt-4 rounded-xl" disabled={requestingQr} onClick={() => void ensureQr(true)}><RefreshCw className={requestingQr ? "animate-spin" : ""} /> Minta ulang sekarang</Button>
          </div>
        )}

        {ownerAndSenderMatch && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Nomor owner dan sender sama. Gunakan dua nomor berbeda agar pesan tidak diabaikan sebagai pesan dari akun bot sendiri.</div>}
        {loadError && <p className="rounded-xl bg-destructive/8 p-3 text-xs text-destructive">{loadError}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><Smartphone className="size-3" /> Sender menerima pesan owner</span>
          <span className="flex items-center gap-1.5"><span className={`size-1.5 rounded-full ${socketConnected ? "bg-emerald-500" : "bg-amber-500"}`} /> {socketConnected ? "Real-time aktif" : "Fallback polling aktif"}</span>
        </div>
      </CardContent>
    </Card>
  );
}
