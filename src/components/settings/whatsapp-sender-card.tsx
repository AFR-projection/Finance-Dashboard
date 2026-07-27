"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type WhatsAppSession = {
  isConnected: boolean;
  phoneNumber: string | null;
  lastQr: string | null;
  updatedAt: string;
};

type SenderStatus = {
  label: string;
  className: string;
};

function resolveStatus(session: WhatsAppSession | null | undefined): SenderStatus {
  if (session === undefined) {
    return { label: "Memeriksa…", className: "border-border bg-muted text-muted-foreground" };
  }
  if (session?.isConnected) {
    return {
      label: "Terhubung",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (session?.lastQr) {
    return {
      label: "Menunggu scan QR",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }
  return {
    label: "Menunggu worker",
    className: "border-border bg-muted text-muted-foreground",
  };
}

function normalizePhone(value?: string | null): string {
  return value?.replace(/\D/g, "") ?? "";
}

export function WhatsAppSenderCard({ ownerPhone }: { ownerPhone?: string }) {
  const [session, setSession] = useState<WhatsAppSession | null>();
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");

  const loadSession = useCallback(async (showLoading = false) => {
    if (showLoading) setRefreshing(true);
    try {
      const response = await fetch("/api/channels", { cache: "no-store" });
      const json = (await response.json()) as {
        data?: { whatsapp?: WhatsAppSession | null };
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(json.error?.message || "Gagal membaca status WhatsApp");
      }
      setSession(json.data?.whatsapp ?? null);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Gagal membaca status WhatsApp");
    } finally {
      if (showLoading) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadSession(), 0);
    const poll = window.setInterval(() => void loadSession(), 10_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(poll);
    };
  }, [loadSession]);

  const status = resolveStatus(session);
  const senderPhone = normalizePhone(session?.phoneNumber);
  const ownerAndSenderMatch = Boolean(
    senderPhone && normalizePhone(ownerPhone) === senderPhone,
  );

  return (
    <Card className="border-border/60 bg-white/70 shadow-none">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>WhatsApp Sender (Baileys)</CardTitle>
          <Badge variant="outline" className={status.className} aria-live="polite">
            {status.label}
          </Badge>
        </div>
        <CardDescription>
          Sender adalah akun WhatsApp yang menjadi inbox bot dan membalas pesan owner. Hubungkan
          akun ini melalui QR seperti WhatsApp Web—tidak memakai token seperti Telegram.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {session?.isConnected ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-900">Sender aktif</p>
            <p className="mt-1 text-lg font-semibold text-emerald-800">
              {senderPhone ? `+${senderPhone}` : "Nomor tersambung"}
            </p>
            <p className="mt-1 text-xs text-emerald-700">
              Kirim chat dari nomor owner ke nomor sender ini untuk berinteraksi dengan Ledgerly.
            </p>
          </div>
        ) : session?.lastQr ? (
          <div className="grid items-center gap-5 sm:grid-cols-[240px_1fr]">
            <div className="rounded-xl border bg-white p-3">
              {/* Data URL dibuat sendiri oleh worker Baileys dan tidak berasal dari input pengguna. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={session.lastQr}
                alt="QR untuk menghubungkan WhatsApp sender Ledgerly"
                className="mx-auto aspect-square w-full max-w-[216px]"
              />
            </div>
            <div className="space-y-2 text-sm">
              <p className="font-medium">Scan dari HP yang akan dijadikan sender:</p>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Buka WhatsApp pada nomor sender.</li>
                <li>Pilih Perangkat tertaut / Linked Devices.</li>
                <li>Pilih Tautkan perangkat lalu scan QR ini.</li>
              </ol>
              <p className="text-xs text-muted-foreground">
                QR diperbarui otomatis. Gunakan nomor kedua agar nomor owner bisa mengirim chat ke
                sender.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-sm">
            <p className="font-medium">QR sender belum tersedia</p>
            <p className="mt-1 text-muted-foreground">
              Pastikan service <code>whatsapp-worker</code> berjalan. Setelah worker aktif, QR akan
              muncul otomatis di sini tanpa mengisi token atau nomor sender secara manual.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              VPS Docker: <code>./scripts/logs.sh whatsapp-worker</code>
            </p>
          </div>
        )}

        {ownerAndSenderMatch && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Nomor owner dan sender terdeteksi sama. Worker mengabaikan pesan dari akun sender
            sendiri, jadi gunakan nomor WhatsApp berbeda untuk owner dan sender.
          </div>
        )}

        {loadError && <p className="text-sm text-destructive">{loadError}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            Nomor owner = pengirim perintah · nomor sender = akun bot penerima pesan
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => void loadSession(true)}
          >
            {refreshing ? "Memeriksa…" : "Perbarui status"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
