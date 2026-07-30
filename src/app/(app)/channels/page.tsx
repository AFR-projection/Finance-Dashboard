"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Link = {
  id: string;
  channel: string;
  externalId: string;
  displayName: string | null;
  isActive: boolean;
};

export default function ChannelsPage() {
  const [links, setLinks] = useState<Link[]>([]);
  const [externalId, setExternalId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pairCode, setPairCode] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/channels");
    const json = await res.json();
    setLinks(json.data?.links ?? []);
  }

  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const poll = setInterval(() => void load(), 15000);
    return () => {
      clearTimeout(initial);
      clearInterval(poll);
    };
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
      body: JSON.stringify({ channel: "TELEGRAM", externalId, displayName }),
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
        <p className="text-muted-foreground">Hubungkan Telegram Bot ke akun Anda.</p>
      </div>

      <Card className="border-border/60 bg-white/70 shadow-none">
        <CardHeader>
          <CardTitle>Pairing code (disarankan)</CardTitle>
          <CardDescription>
            Generate kode, lalu kirim <code>/link KODE</code> ke bot Telegram.
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

      <Card className="border-border/60 bg-white/70 shadow-none">
        <CardHeader>
          <CardTitle>Manual link</CardTitle>
          <CardDescription>Masukkan chat ID numerik Telegram Anda.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Chat ID</Label>
              <Input
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                placeholder="123456789"
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
            Jalankan via Docker Compose: service <code>telegram-worker</code>. Lihat{" "}
            <code>docs/DEPLOYMENT.md</code>.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
