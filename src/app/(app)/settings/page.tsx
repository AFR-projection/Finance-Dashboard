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

export default function SettingsPage() {
  const [provider, setProvider] = useState("GEMINI");
  const [model, setModel] = useState("gemini-2.0-flash");
  const [apiKey, setApiKey] = useState("");
  const [currency, setCurrency] = useState("IDR");
  const [timezone, setTimezone] = useState("Asia/Jakarta");
  const [hasKey, setHasKey] = useState(false);

  const [ownerName, setOwnerName] = useState("");
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramOwnerChatId, setTelegramOwnerChatId] = useState("");
  const [whatsappOwnerPhone, setWhatsappOwnerPhone] = useState("");
  const [hasTelegram, setHasTelegram] = useState(false);
  const [hasWhatsApp, setHasWhatsApp] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((j) => {
        if (!j.data) return;
        setProvider(j.data.aiProvider);
        setModel(j.data.aiModel);
        setCurrency(j.data.currency);
        setTimezone(j.data.timezone);
        setHasKey(j.data.hasApiKey);
        if (j.data.owner) {
          setOwnerName(j.data.owner.ownerName || "");
          setTelegramOwnerChatId(j.data.owner.telegramOwnerChatId || "");
          setWhatsappOwnerPhone(j.data.owner.whatsappOwnerPhone || "");
          setHasTelegram(j.data.owner.hasTelegram);
          setHasWhatsApp(j.data.owner.hasWhatsApp);
        }
      });
  }, []);

  async function saveAi(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section: "ai",
        aiProvider: provider,
        aiModel: model,
        apiKey: apiKey || undefined,
        currency,
        timezone,
      }),
    });
    if (res.ok) {
      toast.success("AI settings tersimpan");
      setApiKey("");
      setHasKey(true);
    } else toast.error("Gagal simpan AI settings");
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
        whatsappOwnerPhone,
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
    setHasWhatsApp(json.data.owner.hasWhatsApp);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-primary">Settings</h1>
        <p className="text-muted-foreground">
          AI provider, API key, dan konfigurasi owner / bot (WA & Telegram).
        </p>
      </div>

      <Card className="border-border/60 bg-white/70 shadow-none">
        <CardHeader>
          <CardTitle>AI Provider</CardTitle>
          <CardDescription>Key disimpan terenkripsi di database.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveAi} className="space-y-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select
                value={provider}
                onValueChange={(v) => {
                  const next = v ?? "GEMINI";
                  setProvider(next);
                  setModel(next === "GEMINI" ? "gemini-2.0-flash" : "openai/gpt-4o-mini");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GEMINI">Google Gemini</SelectItem>
                  <SelectItem value="OPENROUTER">OpenRouter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>API Key {hasKey ? "(tersimpan)" : ""}</Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={hasKey ? "Kosongkan jika tidak diganti" : "sk-... / AIza..."}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Currency</Label>
                <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
              </div>
            </div>
            <Button type="submit">Simpan AI</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-white/70 shadow-none">
        <CardHeader>
          <CardTitle>Owner & Bot</CardTitle>
          <CardDescription>
            Status: Telegram {hasTelegram ? "✓" : "—"} · WhatsApp {hasWhatsApp ? "✓" : "—"} ·
            minimal satu harus aktif agar web bisa dibuka.
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
            <div className="space-y-2">
              <Label>WhatsApp owner phone</Label>
              <Input
                value={whatsappOwnerPhone}
                onChange={(e) => setWhatsappOwnerPhone(e.target.value)}
                placeholder="62812..."
              />
            </div>
            <Button type="submit">Simpan owner / bot</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
