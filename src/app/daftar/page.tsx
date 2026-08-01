"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowRight, Check, Copy, Loader2, Send } from "lucide-react";
import { AuthShell } from "@/components/marketing/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBrowserFingerprint } from "@/lib/fingerprint-client";

type Started = { sessionId: string; username: string; botUsername: string; botLink: string };

export default function DaftarPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [chatId, setChatId] = useState("");
  const [started, setStarted] = useState<Started | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function startSignup(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const fingerprintId = await getBrowserFingerprint();
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, fingerprintId }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error?.message || "Gagal memulai pendaftaran.");
        return;
      }
      setStarted(json.data);
    } catch {
      setError("Gagal terhubung ke server. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyChatId(event: React.FormEvent) {
    event.preventDefault();
    if (!started) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/verify-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: started.sessionId, chatId: chatId.trim() }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error?.message || "Gagal memverifikasi Chat ID.");
        return;
      }
      setDone(true);
      // The challenge is approved; the shared completion endpoint mints the cookie.
      const fingerprintId = await getBrowserFingerprint();
      const session = await fetch("/api/access/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: started.sessionId, fingerprintId }),
      });
      const sessionJson = await session.json();
      if (!sessionJson.ok) {
        setError("Akun dibuat, tapi gagal membuka sesi. Silakan masuk lewat halaman Masuk.");
        setDone(false);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Gagal terhubung ke server. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Buat akun Ledgerly"
      subtitle="Pilih username, ambil Chat ID dari bot Telegram, lalu tempel di sini."
    >
      {!started ? (
        <form onSubmit={startSignup}>
          <Label htmlFor="username" className="text-sm font-semibold text-foreground">
            Username
          </Label>
          <Input
            id="username"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="mis. budisantoso"
            aria-describedby="username-help"
            className="mt-2 h-12 rounded-xl text-base"
          />
          <p id="username-help" className="mt-2 text-xs text-muted-foreground">
            3–20 karakter. Huruf kecil, angka, dan garis bawah.
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

          <Button
            type="submit"
            disabled={submitting || username.trim().length < 3}
            className="mt-6 h-12 w-full cursor-pointer rounded-2xl text-sm font-semibold"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Menyiapkan…
              </>
            ) : (
              <>
                Lanjut
                <ArrowRight className="size-4" strokeWidth={2.2} />
              </>
            )}
          </Button>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Sudah punya akun?{" "}
            <Link
              href="/masuk"
              className="rounded font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
            >
              Masuk
            </Link>
          </p>
        </form>
      ) : (
        <form onSubmit={verifyChatId}>
          <ol className="space-y-4">
            <li className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                1
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">Buka bot &amp; tekan Start</p>
                <a
                  href={started.botLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2.5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground outline-none transition-all hover:-translate-y-0.5 hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/60 active:translate-y-0"
                >
                  <Send className="size-4" strokeWidth={2.2} />
                  Buka @{started.botUsername}
                </a>
              </div>
            </li>

            <li className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                2
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">Salin Chat ID dari balasan bot</p>
                <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                  <Copy aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
                  Bot membalas dengan angka seperti <span className="tabular-money">6786845841</span>
                </p>
              </div>
            </li>

            <li className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                3
              </span>
              <div className="min-w-0 flex-1">
                <Label htmlFor="chatId" className="text-sm font-semibold text-foreground">
                  Tempel Chat ID di sini
                </Label>
                <Input
                  id="chatId"
                  name="chatId"
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="6786845841"
                  aria-describedby="chatid-help"
                  className="tabular-money mt-2 h-12 rounded-xl text-base"
                />
                <p id="chatid-help" className="mt-2 text-xs text-muted-foreground">
                  Username kamu:{" "}
                  <span className="font-semibold text-foreground">@{started.username}</span>
                </p>
              </div>
            </li>
          </ol>

          {error && (
            <p
              role="alert"
              className="mt-5 flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={2.2} />
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={submitting || done || chatId.trim().length < 5}
            className="mt-6 h-12 w-full cursor-pointer rounded-2xl text-sm font-semibold"
          >
            {submitting || done ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {done ? "Membuka dashboard…" : "Memverifikasi…"}
              </>
            ) : (
              <>
                <Check className="size-4" strokeWidth={2.4} />
                Aktifkan akun
              </>
            )}
          </Button>

          <button
            type="button"
            onClick={() => {
              setStarted(null);
              setChatId("");
              setError(null);
            }}
            className="mt-4 h-11 w-full cursor-pointer rounded-xl text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/60"
          >
            Ganti username
          </button>
        </form>
      )}
    </AuthShell>
  );
}
