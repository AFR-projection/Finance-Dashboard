"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { AlertCircle, Loader2, Radio, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBrowserFingerprint } from "@/lib/fingerprint-client";

type Waiting = { sessionId: string; message: string };

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const sessionId = waiting?.sessionId;
    if (!sessionId) return;
    let cancelled = false;

    async function complete() {
      const fingerprintId = await getBrowserFingerprint();
      const res = await fetch("/api/admin/login/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, fingerprintId }),
      });
      const json = await res.json();
      if (cancelled) return;
      if (!json.ok) {
        setError(json.error?.message || "Gagal membuka sesi admin.");
        setWaiting(null);
        return;
      }
      router.replace("/");
      router.refresh();
    }

    const socket = io({ path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.emit("login:join", sessionId);
    socket.on("access:approved", () => void complete());
    socket.on("access:rejected", (p: { reason?: string }) => {
      setError(p.reason || "Permintaan ditolak.");
      setWaiting(null);
    });

    const poll = setInterval(async () => {
      // Admin-scoped status route: the shared /api/access is 404 on this host.
      const res = await fetch(`/api/admin/login/status?sessionId=${sessionId}`);
      const json = await res.json();
      if (cancelled) return;
      if (json.data?.status === "approved") {
        clearInterval(poll);
        void complete();
      } else if (json.data?.status === "rejected" || json.data?.status === "expired") {
        clearInterval(poll);
        setError(json.data.status === "rejected" ? "Permintaan ditolak." : "Sesi kedaluwarsa.");
        setWaiting(null);
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(poll);
      socket.disconnect();
    };
  }, [waiting?.sessionId, router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const fingerprintId = await getBrowserFingerprint();
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, fingerprintId }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error?.message || "Kredensial salah.");
        return;
      }
      setPassword("");
      setWaiting(json.data);
    } catch {
      setError("Gagal terhubung ke server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mk-ink vault-noise flex min-h-svh items-center justify-center px-5 py-10">
      <main className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <span className="grid size-12 place-items-center rounded-2xl border border-ink-border bg-ink-soft text-brand-glow">
            <ShieldCheck aria-hidden className="size-6" strokeWidth={2} />
          </span>
          <h1 className="mt-6 text-2xl font-bold tracking-[-0.03em] text-ink-foreground">
            Panel Master Admin
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Butuh password dan konfirmasi Telegram.
          </p>
        </div>

        <div className="mt-8 rounded-3xl border border-ink-border bg-ink-soft/70 p-6 backdrop-blur-xl">
          {!waiting ? (
            <form onSubmit={submit}>
                <Label htmlFor="username" className="text-sm font-semibold text-ink-foreground">
                  Username
                </Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="mt-2 h-12 rounded-xl border-ink-border bg-ink/60 text-base text-ink-foreground"
                />

                <Label
                  htmlFor="password"
                  className="mt-4 block text-sm font-semibold text-ink-foreground"
                >
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="mt-2 h-12 rounded-xl border-ink-border bg-ink/60 text-base text-ink-foreground"
                />

                {error && (
                  <p
                    role="alert"
                    className="mt-4 flex items-start gap-2 rounded-xl bg-destructive/15 px-3 py-2.5 text-sm text-rose-200"
                  >
                    <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={2.2} />
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={submitting || !username.trim() || !password}
                  className="mt-6 h-12 w-full cursor-pointer rounded-2xl bg-white text-sm font-semibold text-ink hover:bg-white/90"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Memeriksa…
                    </>
                  ) : (
                    "Lanjut ke konfirmasi"
                  )}
                </Button>
              </form>
            ) : (
              <div>
                <div className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-muted">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-glow" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-brand-glow" />
                  </span>
                  Menunggu konfirmasi
                </div>
                <p className="mt-4 text-sm leading-relaxed text-ink-muted">{waiting.message}</p>
                <p className="mt-5 flex items-center justify-center gap-2 text-xs text-ink-muted">
                  <Radio className="size-3.5" strokeWidth={2.2} />
                  Halaman ini pindah sendiri setelah kamu menekan Izinkan
                </p>
              </div>
            )}
        </div>
      </main>
    </div>
  );
}
