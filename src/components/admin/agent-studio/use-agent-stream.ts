"use client";

/**
 * Aliran event per-run dari runtime ke kanvas.
 *
 * Mengikuti pola `use-admin-stream`: socket sebagai jalur cepat, polling sebagai
 * jaring pengaman. Bedanya jendela polling di sini lebih longgar — event agent
 * hanya lahir saat ada orang yang benar-benar mengirim pesan, jadi menanyakannya
 * tiap beberapa detik sebagian besar waktu hanya membangunkan Neon tanpa hasil.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { AgentTelemetryEvent, NodeRunState } from "./shared";

const POLL_MS = 20_000;
const MAX_EVENTS = 120;

/** Cincin status di kanvas memudar setelah run selesai supaya tidak menetap selamanya. */
const HIGHLIGHT_MS = 12_000;

export type StreamStatus = "connecting" | "live" | "polling" | "denied";

export function useAgentStream(initialEvents: AgentTelemetryEvent[]) {
  const [events, setEvents] = useState<AgentTelemetryEvent[]>(initialEvents);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const seen = useRef(new Set(initialEvents.map(eventKey)));

  // Penyaringan dilakukan di luar updater: `seen` adalah ref yang dimutasi, dan
  // updater React boleh dipanggil dua kali (StrictMode) — yang akan membuat
  // batch kedua terlihat "sudah pernah" dan hilang.
  const push = useCallback((incoming: AgentTelemetryEvent[]) => {
    const fresh = incoming.filter((event) => {
      const key = eventKey(event);
      if (seen.current.has(key)) return false;
      seen.current.add(key);
      return true;
    });
    if (fresh.length === 0) return;
    setEvents((prev) => [...fresh, ...prev].slice(0, MAX_EVENTS));
    setLastEventAt(Date.now());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refetch() {
      try {
        const res = await fetch("/api/admin/agent-runs", { cache: "no-store" });
        const json = await res.json();
        if (cancelled || !json.ok) return;
        push(json.data.events as AgentTelemetryEvent[]);
      } catch {
        // Socket bisa saja masih sehat; polling gagal bukan kondisi fatal.
      }
    }

    const socket: Socket = io({ path: "/socket.io", transports: ["websocket", "polling"] });
    socket.on("connect", () => socket.emit("admin:join"));
    socket.on("admin:ready", (payload: { ok: boolean }) => {
      if (!cancelled) setStatus(payload.ok ? "live" : "denied");
    });
    socket.on("agent:event", (event: AgentTelemetryEvent) => {
      if (!cancelled) push([event]);
    });
    socket.on("disconnect", () => !cancelled && setStatus("polling"));
    socket.on("connect_error", () => !cancelled && setStatus("polling"));

    const poll = setInterval(() => void refetch(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(poll);
      socket.disconnect();
    };
  }, [push]);

  /**
   * Status per node, diambil dari run terbaru saja.
   *
   * Menggabungkan beberapa run akan membuat kanvas menampilkan campuran dua
   * eksekusi berbeda — kotak yang menyala dari run lima menit lalu di sebelah
   * kotak yang menyala sekarang.
   */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 2_000);
    return () => clearInterval(timer);
  }, []);

  const latestRunId = useMemo(() => {
    const newest = events.find((event) => event.type === "run:start") ?? events[0];
    return newest?.runId ?? null;
  }, [events]);

  const nodeStates = useMemo<Record<string, NodeRunState>>(() => {
    if (!latestRunId) return {};
    const anchor = events.find((event) => event.runId === latestRunId);
    if (anchor && now - new Date(anchor.at).getTime() > HIGHLIGHT_MS) return {};

    const states: Record<string, NodeRunState> = {};
    // Daftar terbaru-dulu, jadi entri pertama per node adalah yang paling akhir.
    for (const event of events) {
      if (event.type !== "node" || event.runId !== latestRunId) continue;
      if (states[event.nodeId]) continue;
      states[event.nodeId] = { status: event.status, ms: event.ms, detail: event.detail };
    }
    return states;
  }, [events, latestRunId, now]);

  return { events, nodeStates, status, lastEventAt, latestRunId };
}

function eventKey(event: AgentTelemetryEvent) {
  if (event.type === "node") return `${event.runId}:${event.nodeId}:${event.status}:${event.at}`;
  return `${event.runId}:${event.type}:${event.at}`;
}
