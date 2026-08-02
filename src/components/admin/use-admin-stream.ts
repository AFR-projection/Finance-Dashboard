"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { AdminEvent, AdminPulse } from "@/lib/admin-metrics";

export type StreamStatus = "connecting" | "live" | "polling" | "denied";

/** Sockets are best-effort; the poll is what guarantees the numbers stay true. */
const POLL_MS = 12_000;
const MAX_EVENTS = 60;

export function useAdminStream(initialPulse: AdminPulse, initialEvents: AdminEvent[] = []) {
  const [pulse, setPulse] = useState(initialPulse);
  const [events, setEvents] = useState(initialEvents);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [lastBeat, setLastBeat] = useState(() => Date.now());
  const seen = useRef(new Set(initialEvents.map((e) => e.id)));

  const pushEvent = useCallback((event: AdminEvent) => {
    if (seen.current.has(event.id)) return;
    seen.current.add(event.id);
    setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let socket: Socket | null = null;

    async function refetch() {
      try {
        const res = await fetch("/api/admin/pulse?events=1", { cache: "no-store" });
        const json = await res.json();
        if (cancelled || !json.ok) return;
        setPulse(json.data.pulse);
        setLastBeat(Date.now());
        // Server order is newest-first; replay oldest-first so the feed keeps it.
        for (const event of [...(json.data.events as AdminEvent[])].reverse()) pushEvent(event);
      } catch {
        // The socket may still be healthy; a failed poll is not fatal.
      }
    }

    socket = io({ path: "/socket.io", transports: ["websocket", "polling"] });

    socket.on("connect", () => socket?.emit("admin:join"));
    socket.on("admin:ready", (payload: { ok: boolean }) => {
      if (cancelled) return;
      setStatus(payload.ok ? "live" : "denied");
    });
    socket.on("admin:pulse", (next: AdminPulse) => {
      if (cancelled) return;
      setPulse(next);
      setLastBeat(Date.now());
    });
    socket.on("admin:event", (event: AdminEvent) => {
      if (!cancelled) pushEvent(event);
    });
    socket.on("disconnect", () => {
      if (!cancelled) setStatus("polling");
    });
    socket.on("connect_error", () => {
      if (!cancelled) setStatus("polling");
    });

    const poll = setInterval(() => void refetch(), POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(poll);
      socket?.disconnect();
    };
  }, [pushEvent]);

  return { pulse, events, status, lastBeat };
}
