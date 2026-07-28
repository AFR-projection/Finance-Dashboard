"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { getBrowserFingerprint } from "@/lib/fingerprint-client";

type Phase = "checking" | "ready" | "waiting" | "denied";

export default function AccessPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [message, setMessage] = useState("Memeriksa setup…");
  const [confirmCode, setConfirmCode] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const complete = useCallback(
    async (sid: string) => {
      const fingerprintId = await getBrowserFingerprint();
      const res = await fetch("/api/access/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, fingerprintId }),
      });
      const json = await res.json();
      if (!json.ok) {
        if (json.error?.code === "REVALIDATE") {
          setMessage(json.error.message);
          setPhase("denied");
          setError(json.error.message);
          return;
        }
        setError(json.error?.message || "Gagal membuka sesi");
        setPhase("denied");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    },
    [router],
  );

  useEffect(() => {
    async function boot() {
      const st = await fetch("/api/setup").then((r) => r.json());
      if (!st.data?.setupCompleted || !st.data?.isReady) {
        router.replace("/setup");
        return;
      }
      setPhase("ready");
      setMessage("Siap meminta izin akses ke bot owner.");
    }
    void boot();
  }, [router]);

  useEffect(() => {
    if (phase !== "waiting" || !sessionId) return;

    const socket = io({ path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.emit("login:join", sessionId);

    socket.on("access:approved", () => {
      void complete(sessionId);
    });
    socket.on("access:rejected", (p: { reason?: string }) => {
      setError(p.reason || "Akses ditolak");
      setPhase("denied");
    });

    const poll = setInterval(async () => {
      const res = await fetch(`/api/access?sessionId=${sessionId}`);
      const json = await res.json();
      if (json.data?.status === "approved") {
        clearInterval(poll);
        void complete(sessionId);
      } else if (json.data?.status === "rejected" || json.data?.status === "expired") {
        clearInterval(poll);
        setError(json.data.status === "rejected" ? "Akses ditolak" : "Sesi kedaluwarsa");
        setPhase("denied");
      }
    }, 2500);

    return () => {
      clearInterval(poll);
      socket.disconnect();
    };
  }, [phase, sessionId, complete]);

  async function requestAccess() {
    setError(null);
    const fingerprintId = await getBrowserFingerprint();
    const res = await fetch("/api/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fingerprintId }),
    });
    const json = await res.json();
    if (!json.ok) {
      if (json.error?.code === "SETUP_REQUIRED") {
        router.replace("/setup");
        return;
      }
      setError(json.error?.message || "Gagal meminta akses");
      return;
    }
    setSessionId(json.data.sessionId);
    setConfirmCode(json.data.confirmCode);
    setMessage(json.data.message);
    setPhase("waiting");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="font-[family-name:var(--font-display)] text-4xl text-primary">Akses Ledgerly</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Self-hosted · bukan SaaS publik. Setiap kunjungan butuh izin owner via bot.
      </p>

      <div className="mt-8 rounded-2xl border border-border/60 bg-white/80 p-6 space-y-4">
        {phase === "checking" && <p className="text-sm text-muted-foreground">{message}</p>}

        {phase === "ready" && (
          <>
            <p className="text-sm text-muted-foreground">
              Kami akan kirim detail perangkat & lokasi ke bot owner. Setelah diizinkan, dashboard
              terbuka otomatis.
            </p>
            <Button className="w-full" onClick={() => void requestAccess()}>
              Minta izin akses
            </Button>
          </>
        )}

        {phase === "waiting" && (
          <>
            <p className="text-sm">{message}</p>
            {confirmCode && (
              <p className="font-[family-name:var(--font-display)] text-3xl tracking-widest text-primary">
                {confirmCode}
              </p>
            )}
            <p className="text-xs text-muted-foreground animate-pulse">
              {confirmCode
                ? "Menunggu balasan approve dari bot…"
                : "Menunggu owner menekan Izinkan di Telegram…"}
            </p>
          </>
        )}

        {phase === "denied" && (
          <>
            <p className="text-sm text-destructive">{error || "Akses ditolak"}</p>
            <Button variant="outline" className="w-full" onClick={() => setPhase("ready")}>
              Coba lagi
            </Button>
          </>
        )}

        {error && phase !== "denied" && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
