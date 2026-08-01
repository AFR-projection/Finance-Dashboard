"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function SettingsPage() {
  const [currency, setCurrency] = useState("IDR");
  const [timezone, setTimezone] = useState("Asia/Jakarta");

  const [ownerName, setOwnerName] = useState("");
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramOwnerChatId, setTelegramOwnerChatId] = useState("");
  const [hasTelegram, setHasTelegram] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [heartbeatEnabled, setHeartbeatEnabled] = useState(true);
  const [heartbeatHour, setHeartbeatHour] = useState(7);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((j) => {
        if (!j.data) return;
        // Guarded because a missing field would flip a controlled input to
        // uncontrolled, which React refuses to do quietly.
        if (typeof j.data.currency === "string") setCurrency(j.data.currency);
        if (typeof j.data.timezone === "string") setTimezone(j.data.timezone);
        if (typeof j.data.heartbeatEnabled === "boolean") {
          setHeartbeatEnabled(j.data.heartbeatEnabled);
        }
        if (typeof j.data.heartbeatHour === "number") setHeartbeatHour(j.data.heartbeatHour);
        if (j.data.owner) {
          setIsAdmin(true);
          setOwnerName(j.data.owner.ownerName || "");
          setTelegramOwnerChatId(j.data.owner.telegramOwnerChatId || "");
          setHasTelegram(j.data.owner.hasTelegram);
        }
      });
  }, []);

  async function savePreferences(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "ai", currency, timezone }),
    });
    if (res.ok) toast.success("Preferensi tersimpan");
    else toast.error("Gagal menyimpan preferensi");
  }

  async function saveHeartbeat(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "ai", heartbeatEnabled, heartbeatHour }),
    });
    if (res.ok) toast.success("Jadwal heartbeat tersimpan");
    else toast.error("Gagal simpan jadwal heartbeat");
  }

  async function saveOwner(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section: "owner",
        ownerName,
        telegramBotToken: telegramBotToken || undefined,
        telegramOwnerChatId,
      }),
    });
    const json = await res.json();
    if (!json.ok) {
      toast.error(json.error?.message || "Gagal simpan owner/bot");
      return;
    }
    toast.success("Owner & bot tersimpan");
    setTelegramBotToken("");
    setHasTelegram(json.data.owner.hasTelegram);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-primary">Settings</h1>
        <p className="text-muted-foreground">
          Preferensi mata uang, zona waktu, dan jadwal laporan otomatis.
        </p>
      </div>

      <Card className="border-border/60 bg-white/70 shadow-none">
        <CardHeader>
          <CardTitle>Preferensi</CardTitle>
          <CardDescription>
            Model AI dikelola oleh admin platform, jadi tidak ada yang perlu kamu atur di sini.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={savePreferences} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="currency">Mata uang</Label>
                <Input
                  id="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Zona waktu</Label>
                <Input
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                />
              </div>
            </div>
            <Button type="submit">Simpan preferensi</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-white/70 shadow-none">
        <CardHeader>
          <CardTitle>Heartbeat</CardTitle>
          <CardDescription>
            Ledgerly menganalisis keuanganmu tiap pagi dan mengirim rekap tiap Senin. Kalau tidak
            ada yang penting, ia diam.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveHeartbeat} className="space-y-4">
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-xl border border-border/60 px-3 py-2">
              <span className="text-sm font-medium">Aktifkan heartbeat</span>
              <input
                type="checkbox"
                checked={heartbeatEnabled}
                onChange={(e) => setHeartbeatEnabled(e.target.checked)}
                className="size-5 accent-primary"
              />
            </label>
            <div className="space-y-2">
              <Label htmlFor="heartbeat-hour">Jam kirim (waktu {timezone})</Label>
              <Input
                id="heartbeat-hour"
                type="number"
                min={0}
                max={23}
                value={heartbeatHour}
                onChange={(e) => setHeartbeatHour(Number(e.target.value))}
                disabled={!heartbeatEnabled}
              />
              <p className="text-xs text-muted-foreground">
                0–23. Senin dikirim rekap mingguan menggantikan brief harian.
              </p>
            </div>
            <Button type="submit">Simpan heartbeat</Button>
          </form>
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card className="border-border/60 bg-white/70 shadow-none">
          <CardHeader>
            <CardTitle>Owner & Bot</CardTitle>
            <CardDescription>
              Status konfigurasi: Telegram {hasTelegram ? "✓" : "—"}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveOwner} className="space-y-4">
              <div className="space-y-2">
                <Label>Nama owner</Label>
                <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Telegram bot token {hasTelegram ? "(tersimpan)" : ""}</Label>
                <Input
                  type="password"
                  value={telegramBotToken}
                  onChange={(e) => setTelegramBotToken(e.target.value)}
                  placeholder={hasTelegram ? "Kosongkan jika tidak diganti" : "dari BotFather"}
                />
              </div>
              <div className="space-y-2">
                <Label>Telegram owner chat ID</Label>
                <Input
                  value={telegramOwnerChatId}
                  onChange={(e) => setTelegramOwnerChatId(e.target.value)}
                />
              </div>
              <Button type="submit">Simpan owner / bot</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
