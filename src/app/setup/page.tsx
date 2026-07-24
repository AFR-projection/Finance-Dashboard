"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function SetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ownerName, setOwnerName] = useState("");
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramOwnerChatId, setTelegramOwnerChatId] = useState("");
  const [whatsappOwnerPhone, setWhatsappOwnerPhone] = useState("");

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((j) => {
        if (j.data?.isReady) {
          router.replace("/access");
          return;
        }
        if (j.data?.setupCompleted && !j.data?.isReady) {
          toast.message("Setup ada tapi channel belum lengkap — isi ulang form.");
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownerName,
        telegramBotToken,
        telegramOwnerChatId,
        whatsappOwnerPhone,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!json.ok) {
      toast.error(json.error?.message || "Setup gagal");
      return;
    }
    toast.success("Setup selesai. Lanjut minta akses via bot.");
    router.push("/access");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Memeriksa konfigurasi…
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10">
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-primary">
          Setup Owner
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Platform self-hosted untuk <strong>satu pemilik</strong>. Tidak ada daftar publik.
          Sebelum dashboard bisa dibuka, wajib set owner + minimal 1 bot (Telegram dan/atau
          WhatsApp).
        </p>
      </div>

      <Card className="border-border/60 bg-white/80 shadow-none">
        <CardHeader>
          <CardTitle>Bootstrap</CardTitle>
          <CardDescription>
            Setelah ini, setiap kunjungan web meminta izin ke bot owner (perangkat + lokasi).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label>Nama owner</Label>
              <Input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Nama kamu"
                required
              />
            </div>

            <div className="rounded-lg border border-border/50 p-3 space-y-3">
              <p className="text-sm font-medium">Telegram (opsional tapi direkomendasikan)</p>
              <div className="space-y-1">
                <Label>Bot token (BotFather)</Label>
                <Input
                  value={telegramBotToken}
                  onChange={(e) => setTelegramBotToken(e.target.value)}
                  placeholder="123456:ABC..."
                />
              </div>
              <div className="space-y-1">
                <Label>Chat ID kamu</Label>
                <Input
                  value={telegramOwnerChatId}
                  onChange={(e) => setTelegramOwnerChatId(e.target.value)}
                  placeholder="dari /start bot → angka ID"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Tip: start bot kamu, lalu buka API getUpdates atau pakai @userinfobot.
              </p>
            </div>

            <div className="rounded-lg border border-border/50 p-3 space-y-3">
              <p className="text-sm font-medium">WhatsApp owner (opsional)</p>
              <div className="space-y-1">
                <Label>Nomor owner (internasional, tanpa +)</Label>
                <Input
                  value={whatsappOwnerPhone}
                  onChange={(e) => setWhatsappOwnerPhone(e.target.value)}
                  placeholder="62812xxxxxxx"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Nomor yang akan mengirim <code>approve KODE</code> ke bot Baileys. Jalankan{" "}
                <code>npm run worker:whatsapp</code> / container WA setelah setup.
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Menyimpan…" : "Simpan & lanjut"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
