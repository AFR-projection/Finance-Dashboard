"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowRight, Loader2, Radio } from "lucide-react";
import { AuthShell } from "@/components/marketing/auth-shell";
import { useChallengeWatch } from "@/components/marketing/use-challenge-watch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBrowserFingerprint } from "@/lib/fingerprint-client";

type Started = { sessionId: string; message: string; needsStart: boolean };

export default function MasukPage() {
  const [username, setUsername] = useState("");
  const [started, setStarted] = useState<Started | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const watch = useChallengeWatch(started?.sessionId ?? null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const fingerprintId = await getBrowserFingerprint();
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, fingerprintId }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error?.message || "Gagal memulai proses masuk.");
        return;
      }
      setStarted(json.data);
    } catch {
      setError("Gagal terhubung ke server. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  const failure = watch.status === "failed" ? watch.message : null;

  return (
    <AuthShell
      title="Masuk ke Ledgerly"
      subtitle="Masukkan username. Bot akan mengirim konfirmasi ke Telegram kamu."
    >
      <AnimatePresence mode="wait">
        {!started ? (
          <motion.form
            key="form"
            onSubmit={submit}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <Label htmlFor="username" className="text-sm font-semibold text-foreground">
              Username
            </Label>
            <Input
              id="username"
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="username kamu"
              className="mt-2 h-12 rounded-xl text-base"
            />

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
                  <Loader2 className="size-4 animate-spin" /> Mengirim…
                </>
              ) : (
                <>
                  Kirim konfirmasi
                  <ArrowRight className="size-4" strokeWidth={2.2} />
                </>
              )}
            </Button>

            <p className="mt-5 text-center text-sm text-muted-foreground">
              Belum punya akun?{" "}
              <Link
                href="/daftar"
                className="rounded font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Daftar
              </Link>
            </p>
          </motion.form>
        ) : (
          <motion.div
            key="waiting"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary" />
                <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
              </span>
              Menunggu konfirmasi
            </div>

            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{started.message}</p>

            <div className="mt-6 rounded-2xl border border-border bg-secondary/60 px-4 py-4">
              <p className="flex items-center gap-2 text-sm text-secondary-foreground">
                <Radio className="size-4 shrink-0 text-primary" strokeWidth={2.2} />
                Buka Telegram, lalu tekan <b>Izinkan</b> pada pesan dari bot.
              </p>
            </div>

            <p className="mt-5 text-center text-xs text-muted-foreground">
              Halaman ini pindah sendiri setelah kamu menekan Izinkan
            </p>

            {(failure || started.needsStart) && (
              <div role="alert" className="mt-5">
                <p className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={2.2} />
                  {failure ?? "Bot tidak bisa mengirim pesan. Buka chat bot dan tekan Start dulu."}
                </p>
                <Button
                  variant="outline"
                  className="mt-3 h-11 w-full cursor-pointer rounded-2xl text-sm font-semibold"
                  onClick={() => {
                    setStarted(null);
                    setError(null);
                  }}
                >
                  Coba lagi
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </AuthShell>
  );
}
