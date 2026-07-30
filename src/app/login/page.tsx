"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { FormEvent, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBrowserFingerprint } from "@/lib/fingerprint-client";

type Phase = "form" | "awaiting_bot" | "signing_in";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const [confirmCode, setConfirmCode] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const finishWithTicket = useCallback(
    async (sid: string, ticket: string) => {
      setPhase("signing_in");
      const fingerprintId = await getBrowserFingerprint();

      const exchange = await fetch("/api/auth/login-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, ticket, fingerprintId }),
      });
      const ex = await exchange.json();
      if (!ex.ok) {
        if (ex.error?.code === "REVALIDATE") {
          setPhase("awaiting_bot");
          setConfirmCode(ex.error.confirmCode || confirmCode);
          setReason(ex.error.message);
          setError(null);
          return;
        }
        setError(ex.error?.message || "Gagal menyelesaikan login.");
        setPhase("form");
        return;
      }

      const res = await signIn("credentials", {
        email: ex.data.email,
        ticket,
        sessionId: sid,
        redirect: false,
      });

      if (res?.error) {
        setError("Sesi login gagal. Coba lagi.");
        setPhase("form");
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    },
    [callbackUrl, confirmCode, router],
  );

  useEffect(() => {
    if (phase !== "awaiting_bot" || !sessionId) return;

    const socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;
    socket.emit("login:join", sessionId);

    socket.on("login:confirmed", (payload: { ticket: string }) => {
      void finishWithTicket(sessionId, payload.ticket);
    });
    socket.on("login:rejected", (payload: { reason?: string }) => {
      setError(payload.reason || "Login ditolak via bot.");
      setPhase("form");
    });
    socket.on("login:revalidate", (payload: { reason?: string }) => {
      setReason(payload.reason || "Perlu konfirmasi ulang via bot.");
      setPhase("awaiting_bot");
    });

    // Polling fallback
    const poll = setInterval(async () => {
      const res = await fetch(`/api/auth/login-status?sessionId=${sessionId}`);
      const json = await res.json();
      if (json.data?.status === "approved" && json.data.ticket) {
        clearInterval(poll);
        void finishWithTicket(sessionId, json.data.ticket);
      } else if (json.data?.status === "rejected" || json.data?.status === "expired") {
        clearInterval(poll);
        setError(json.data.status === "rejected" ? "Login ditolak." : "Sesi kedaluwarsa.");
        setPhase("form");
      }
    }, 3000);

    return () => {
      clearInterval(poll);
      socket.disconnect();
    };
  }, [phase, sessionId, finishWithTicket]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const fingerprintId = await getBrowserFingerprint();

    const res = await fetch("/api/auth/login-challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, fingerprintId }),
    });
    const json = await res.json();
    setLoading(false);

    if (!json.ok) {
      setError(json.error?.message || "Email atau password salah.");
      return;
    }

    if (json.data.status === "approved" && json.data.ticket) {
      await finishWithTicket(json.data.sessionId, json.data.ticket);
      return;
    }

    setSessionId(json.data.sessionId);
    setConfirmCode(json.data.confirmCode);
    setReason(json.data.reason);
    setPhase("awaiting_bot");
  }

  if (phase === "awaiting_bot") {
    return (
      <div className="mt-8 space-y-4 rounded-xl border border-border/60 bg-white/70 p-4">
        <h2 className="font-semibold text-primary">Konfirmasi via Bot</h2>
        <p className="text-sm text-muted-foreground">
          {reason || "Perangkat/lokasi perlu validasi. Setujui login dari Telegram."}
        </p>
        {confirmCode && (
          <p className="font-[family-name:var(--font-display)] text-3xl tracking-widest text-primary">
            {confirmCode}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Kirim: <code>/approve {confirmCode}</code> atau <code>/reject {confirmCode}</code>
        </p>
        <p className="text-xs text-muted-foreground animate-pulse">
          Menunggu konfirmasi real-time (Socket.io)...
        </p>
        <Button type="button" variant="outline" className="w-full" onClick={() => setPhase("form")}>
          Batal
        </Button>
      </div>
    );
  }

  if (phase === "signing_in") {
    return <p className="mt-8 text-sm text-muted-foreground">Masuk ke dashboard...</p>;
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Memeriksa perangkat..." : "Sign in"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Login dilindungi fingerprint + geo-IP. Perangkat baru / pindah lokasi drastis wajib
        konfirmasi bot.
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border/70 bg-white/80 p-8 shadow-sm backdrop-blur">
        <Link href="/" className="font-[family-name:var(--font-display)] text-3xl text-primary">
          Ledgerly
        </Link>
        <h1 className="mt-4 text-xl font-semibold">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Masuk untuk membuka dashboard keuangan Anda.</p>
        <Suspense>
          <LoginForm />
        </Suspense>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Belum punya akun?{" "}
          <Link href="/register" className="text-primary underline-offset-4 hover:underline">
            Daftar
          </Link>
        </p>
      </div>
    </div>
  );
}
