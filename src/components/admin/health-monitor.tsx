"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CircleSlash, RefreshCw, XCircle } from "lucide-react";
import { LiveDot, Panel, PanelHeader, Tone } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

type HealthCheck = {
  key: string;
  label: string;
  status: "up" | "down" | "off";
  latencyMs: number | null;
  detail: string;
};

type Runtime = {
  uptimeSeconds: number;
  nodeVersion: string;
  memoryMb: number;
  env: string;
};

const POLL_MS = 15_000;

function uptimeLabel(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} hari ${hours} jam`;
  if (hours > 0) return `${hours} jam ${minutes} menit`;
  return `${minutes} menit`;
}

export function HealthMonitor({
  initialChecks,
  initialRuntime,
}: {
  initialChecks: HealthCheck[];
  initialRuntime: Runtime;
}) {
  const [checks, setChecks] = useState(initialChecks);
  const [runtime, setRuntime] = useState(initialRuntime);
  const [refreshing, setRefreshing] = useState(false);

  // Health is a probe, not a counter, so it polls on its own cadence rather
  // than riding the pulse — each tick costs a real round-trip to Telegram.
  useEffect(() => {
    let cancelled = false;

    async function probe() {
      try {
        const res = await fetch("/api/admin/health", { cache: "no-store" });
        const json = await res.json();
        if (cancelled || !json.ok) return;
        setChecks(json.data.checks);
        setRuntime(json.data.runtime);
      } catch {
        // Leave the last known state on screen.
      }
    }

    const timer = setInterval(() => void probe(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  async function refreshNow() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/health", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        setChecks(json.data.checks);
        setRuntime(json.data.runtime);
      }
    } finally {
      setRefreshing(false);
    }
  }

  const allUp = checks.every((c) => c.status !== "down");

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="Status layanan"
          hint={allUp ? "Semua layanan wajib merespons" : "Ada layanan yang tidak merespons"}
          actions={
            <div className="flex items-center gap-2">
              <Tone tone={allUp ? "positive" : "danger"}>
                <LiveDot live={allUp} />
                {allUp ? "Sehat" : "Bermasalah"}
              </Tone>
              <button
                type="button"
                onClick={() => void refreshNow()}
                disabled={refreshing}
                aria-label="Periksa ulang sekarang"
                className="grid size-8 cursor-pointer place-items-center rounded-lg border border-ink-border text-ink-muted outline-none transition-colors hover:text-ink-foreground focus-visible:ring-3 focus-visible:ring-brand-glow/40 disabled:opacity-50"
              >
                <RefreshCw
                  aria-hidden
                  className={cn("size-3.5", refreshing && "animate-spin")}
                  strokeWidth={2.2}
                />
              </button>
            </div>
          }
        />
        <ul className="grid gap-px overflow-hidden bg-ink-border/40 sm:grid-cols-2 xl:grid-cols-3">
          {checks.map((check) => {
            const Icon =
              check.status === "up" ? CheckCircle2 : check.status === "down" ? XCircle : CircleSlash;
            const color =
              check.status === "up"
                ? "text-brand-glow"
                : check.status === "down"
                  ? "text-rose-300"
                  : "text-ink-muted";
            return (
              <li key={check.key} className="bg-ink-soft/50 px-5 py-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink-foreground">
                    <Icon aria-hidden className={cn("size-4", color)} strokeWidth={2.2} />
                    {check.label}
                  </span>
                  {check.latencyMs !== null && (
                    <span className="tabular-money text-[11px] text-ink-muted">
                      {check.latencyMs} ms
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-ink-muted">{check.detail}</p>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel>
        <PanelHeader title="Proses web" hint="Instance yang melayani konsol ini" />
        <div className="grid gap-px overflow-hidden bg-ink-border/40 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Uptime", value: uptimeLabel(runtime.uptimeSeconds) },
            { label: "Memori", value: `${runtime.memoryMb} MB` },
            { label: "Node", value: runtime.nodeVersion },
            { label: "Lingkungan", value: runtime.env },
          ].map((item) => (
            <div key={item.label} className="bg-ink-soft/50 px-5 py-4">
              <p className="tabular-money text-lg font-bold text-ink-foreground">{item.value}</p>
              <p className="mt-0.5 text-sm text-ink-muted">{item.label}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
