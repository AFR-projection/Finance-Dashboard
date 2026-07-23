"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type Link = {
  id: string;
  channel: string;
  externalId: string;
  displayName: string | null;
  isActive: boolean;
};

type WaSession = {
  isConnected: boolean;
  phoneNumber: string | null;
  lastQr: string | null;
} | null;

export default function ChannelsPage() {
  const [links, setLinks] = useState<Link[]>([]);
  const [wa, setWa] = useState<WaSession>(null);
  const [channel, setChannel] = useState("TELEGRAM");
  const [externalId, setExternalId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pairCode, setPairCode] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/channels");
    const json = await res.json();
    setLinks(json.data?.links ?? []);
    setWa(json.data?.whatsapp ?? null);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  async function generatePairCode() {
    const res = await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pair-code" }),
    });
    const json = await res.json();
    if (json.ok) {
      setPairCode(json.data.code);
      toast.success("Pairing code dibuat (berlaku 10 menit)");
    } else {
      toast.error("Gagal membuat pairing code");
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, externalId, displayName }),
    });
    if (res.ok) {
      toast.success("Channel linked");
      setExternalId("");
      setDisplayName("");
      await load();
    } else {
      toast.error("Failed to link channel");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-primary">Channels</h1>
        <p className="text-muted-foreground">
          Hubungkan WhatsApp (Baileys) dan Telegram Bot ke akun Anda.
        </p>
      </div>

      <Card className="border-border/60 bg-white/70 shadow-none">
        <CardHeader>
          <CardTitle>Pairing code (disarankan)</CardTitle>
          <CardDescription>
            Generate kode, lalu kirim dari chat: Telegram <code>/link KODE</code> atau WhatsApp{" "}
            <code>link KODE</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button type="button" onClick={generatePairCode}>
            Generate pairing code
          </Button>
          {pairCode && (
            <div className="rounded-lg border border-border/60 bg-white px-4 py-3">
              <p className="text-xs text-muted-foreground">Kode Anda</p>
              <p className="font-[family-name:var(--font-display)] text-3xl tracking-widest text-primary">
                {pairCode}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {wa && (
        <Card className="border-border/60 bg-white/70 shadow-none">
          <CardHeader>
            <CardTitle>WhatsApp session</CardTitle>
            <CardDescription>
              Status koneksi Baileys worker (set WHATSAPP_OWNER_USER_ID untuk sync QR ke dashboard).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              Status:{" "}
              <span className={wa.isConnected ? "text-emerald-700" : "text-amber-700"}>
                {wa.isConnected ? "Connected" : "Disconnected"}
              </span>
              {wa.phoneNumber ? ` · ${wa.phoneNumber}` : ""}
            </p>
            {!wa.isConnected && wa.lastQr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={wa.lastQr} alt="WhatsApp QR" className="mx-auto max-w-[240px] rounded-lg" />
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-border/60 bg-white/70 shadow-none">
        <CardHeader>
          <CardTitle>Manual link</CardTitle>
          <CardDescription>
            Telegram: chat ID numerik. WhatsApp: nomor internasional tanpa +.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Channel</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v ?? "TELEGRAM")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TELEGRAM">Telegram</SelectItem>
                  <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>External ID</Label>
              <Input
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                placeholder={channel === "TELEGRAM" ? "123456789" : "6281234567890"}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Display name</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <Button type="submit">Link</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-white/70 shadow-none">
        <CardHeader>
          <CardTitle>Active links</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {links.length === 0 && (
            <p className="text-sm text-muted-foreground">Belum ada channel terhubung.</p>
          )}
          {links.map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium">
                  {l.channel} · {l.displayName || l.externalId}
                </div>
                <div className="text-muted-foreground">{l.externalId}</div>
              </div>
              <span className={l.isActive ? "text-emerald-700" : "text-muted-foreground"}>
                {l.isActive ? "active" : "inactive"}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-white/70 shadow-none">
        <CardHeader>
          <CardTitle>Worker setup (VPS)</CardTitle>
          <CardDescription>
            Jalankan via Docker Compose: service <code>telegram-worker</code> dan{" "}
            <code>whatsapp-worker</code>. Lihat <code>docs/DEPLOYMENT.md</code>.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
