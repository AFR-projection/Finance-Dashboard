"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { getBrowserFingerprint } from "@/lib/fingerprint-client";

type Outcome = { status: "idle" } | { status: "failed"; message: string };

/**
 * Watches a challenge until Telegram answers, then exchanges it for a session.
 *
 * Socket.io delivers the result instantly, but the poll is not a redundancy: the
 * embedded bot and the standalone worker run in different processes, and only one
 * of them shares memory with this server's socket instance.
 */
export function useChallengeWatch(sessionId: string | null) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ status: "idle" });
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    async function complete() {
      const fingerprintId = await getBrowserFingerprint();
      const res = await fetch("/api/access/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, fingerprintId }),
      });
      const json = await res.json();
      if (cancelled) return;
      if (!json.ok) {
        setOutcome({ status: "failed", message: json.error?.message || "Gagal membuka sesi." });
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    }

    const socket = io({ path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.emit("login:join", sessionId);
    socket.on("access:approved", () => void complete());
    socket.on("access:rejected", (payload: { reason?: string }) => {
      setOutcome({ status: "failed", message: payload.reason || "Permintaan ditolak." });
    });

    const poll = setInterval(async () => {
      const res = await fetch(`/api/access?sessionId=${sessionId}`);
      const json = await res.json();
      if (cancelled) return;
      if (json.data?.status === "approved") {
        clearInterval(poll);
        void complete();
      } else if (json.data?.status === "rejected" || json.data?.status === "expired") {
        clearInterval(poll);
        setOutcome({
          status: "failed",
          message:
            json.data.status === "rejected"
              ? "Permintaan ditolak dari Telegram."
              : "Sesi kedaluwarsa. Coba lagi ya.",
        });
      }
    }, 2500);

    return () => {
      cancelled = true;
      clearInterval(poll);
      socket.disconnect();
    };
  }, [sessionId, router]);

  return outcome;
}
