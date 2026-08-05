"use client";

/**
 * Aliran event per-run dari runtime ke kanvas.
 *
 * Mengikuti pola `use-admin-stream`: socket sebagai jalur cepat, polling sebagai
 * jaring pengaman. Bedanya jendela polling di sini lebih longgar — event agent
 * hanya lahir saat ada orang yang benar-benar mengirim pesan, jadi menanyakannya
 * tiap beberapa detik sebagian besar waktu hanya membangunkan Neon tanpa hasil.
 *
 * Hook ini memberi dua lapis pembacaan dari buffer yang sama. `nodeStates` adalah
 * potret run terakhir — bahan kedipan di kanvas. `nodeHealth` dan `runSummary`
 * adalah agregat seluruh buffer: bukan "apa yang barusan terjadi", melainkan
 * "node mana yang selalu lambat" dan "berapa run yang gagal belakangan ini".
 * Keduanya dihitung dari data yang sudah ada di memori, jadi tidak menambah satu
 * pun permintaan ke server.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { AgentTelemetryEvent, NodeRunState } from "./shared";

const POLL_MS = 20_000;
const MAX_EVENTS = 120;

/** Cincin status di kanvas memudar setelah run selesai supaya tidak menetap selamanya. */
const HIGHLIGHT_MS = 12_000;

export type StreamStatus = "connecting" | "live" | "polling" | "denied";

/** Ringkasan perilaku satu node sepanjang buffer, bukan pada satu run. */
export type NodeHealth = {
  samples: number;
  avgMs: number;
  maxMs: number;
  errors: number;
  skipped: number;
};

export type RunSummary = {
  total: number;
  ok: number;
  error: number;
  /** Median dan persentil ke-95 durasi run penuh, dalam ms. */
  p50: number;
  p95: number;
};

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

  /**
   * Agregat per node sepanjang buffer.
   *
   * Event "running" dibuang: ia dikirim sebelum node selesai, jadi durasinya
   * belum ada dan menghitungnya sebagai sampel akan menarik rata-rata ke bawah
   * setiap kali sebuah run sedang berjalan.
   */
  const nodeHealth = useMemo<Record<string, NodeHealth>>(() => {
    const totals: Record<string, { sum: number; count: number; max: number; errors: number; skipped: number }> = {};

    for (const event of events) {
      if (event.type !== "node" || event.status === "running") continue;
      const bucket = (totals[event.nodeId] ??= { sum: 0, count: 0, max: 0, errors: 0, skipped: 0 });
      bucket.count += 1;
      if (event.ms !== undefined) {
        bucket.sum += event.ms;
        bucket.max = Math.max(bucket.max, event.ms);
      }
      if (event.status === "error") bucket.errors += 1;
      if (event.status === "skipped") bucket.skipped += 1;
    }

    return Object.fromEntries(
      Object.entries(totals).map(([nodeId, bucket]) => [
        nodeId,
        {
          samples: bucket.count,
          avgMs: bucket.count > 0 ? Math.round(bucket.sum / bucket.count) : 0,
          maxMs: bucket.max,
          errors: bucket.errors,
          skipped: bucket.skipped,
        },
      ]),
    );
  }, [events]);

  const runSummary = useMemo<RunSummary>(() => {
    const durations: number[] = [];
    let ok = 0;
    let error = 0;

    for (const event of events) {
      if (event.type !== "run:end") continue;
      durations.push(event.ms);
      if (event.status === "ok") ok += 1;
      else error += 1;
    }

    durations.sort((a, b) => a - b);
    return {
      total: durations.length,
      ok,
      error,
      p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
    };
  }, [events]);

  return { events, nodeStates, nodeHealth, runSummary, status, lastEventAt, latestRunId };
}

/** Persentil pada deret yang sudah terurut. Deret kosong bernilai 0, bukan NaN. */
function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(fraction * sorted.length));
  return sorted[index];
}

function eventKey(event: AgentTelemetryEvent) {
  if (event.type === "node") return `${event.runId}:${event.nodeId}:${event.status}:${event.at}`;
  return `${event.runId}:${event.type}:${event.at}`;
}
