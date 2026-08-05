"use client";

/**
 * Dok bawah workspace.
 *
 * Dibuat bisa dilipat karena kanvas dan konsol memperebutkan tinggi layar yang
 * sama. Versi sebelumnya memberi keduanya tinggi tetap sekaligus — kanvas 40rem
 * di atas konsol 22rem — yang pada layar laptop berarti tidak ada satu pun yang
 * pernah terlihat utuh, dan halaman harus digulir bolak-balik untuk mencocokkan
 * node yang berkedip dengan barisnya di log.
 *
 * Terlipat, dok tetap menyisakan satu baris: status koneksi dan ringkasan run
 * terakhir. Itu informasi yang paling sering ditengok, dan cukup tipis untuk
 * tidak mengambil tinggi dari kanvas.
 */

import { useMemo } from "react";
import { ChevronDown, ListTree, Timer, Wand2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { LiveDot, Panel } from "@/components/admin/ui";
import { HeartbeatList, RunList, groupRuns } from "./run-console";
import { TestPanel } from "./test-panel";
import { formatMs, type AgentGraphData, type AgentTelemetryEvent, type HeartbeatRunRow } from "./shared";
import type { StreamStatus } from "./use-agent-stream";

export type DockTab = "runs" | "heartbeat" | "test";

const STATUS_LABEL: Record<StreamStatus, string> = {
  live: "Terhubung realtime",
  denied: "Socket menolak sesi",
  polling: "Mode polling",
  connecting: "Menyambung…",
};

export function Dock({
  open,
  tab,
  onTabChange,
  onToggle,
  events,
  heartbeatRuns,
  status,
  nodeLabels,
  graph,
}: {
  open: boolean;
  tab: DockTab;
  onTabChange: (tab: DockTab) => void;
  onToggle: () => void;
  events: AgentTelemetryEvent[];
  heartbeatRuns: HeartbeatRunRow[];
  status: StreamStatus;
  nodeLabels: Record<string, string>;
  graph: AgentGraphData;
}) {
  const runs = useMemo(() => groupRuns(events), [events]);
  const latest = runs[0];

  return (
    <Panel
      className={cn(
        "flex shrink-0 flex-col overflow-hidden transition-[height] duration-200 motion-reduce:transition-none",
        open ? "h-[19rem]" : "h-11",
      )}
    >
      <div className="flex h-11 shrink-0 items-center gap-2 px-2.5">
        <div role="tablist" aria-label="Tampilan konsol" className="flex gap-0.5">
          <TabButton
            tab="runs"
            active={open && tab === "runs"}
            icon={ListTree}
            count={runs.length}
            onSelect={onTabChange}
          >
            Eksekusi
          </TabButton>
          <TabButton
            tab="heartbeat"
            active={open && tab === "heartbeat"}
            icon={Timer}
            count={heartbeatRuns.length}
            onSelect={onTabChange}
          >
            <span className="hidden sm:inline">Siklus proaktif</span>
            <span className="sm:hidden">Proaktif</span>
          </TabButton>
          <TabButton tab="test" active={open && tab === "test"} icon={Wand2} onSelect={onTabChange}>
            Tes
          </TabButton>
        </div>

        {/* Ringkasan run terakhir hanya berguna saat dok tertutup; terbuka, daftarnya sendiri yang bicara. */}
        {!open && latest && (
          <span className="hidden min-w-0 items-center gap-1.5 text-[11px] text-ink-muted md:flex">
            <span aria-hidden className="text-ink-border">
              ·
            </span>
            <span className="truncate">
              terakhir: {latest.track === "heartbeat" ? "laporan proaktif" : "chat"}
            </span>
            <span className="tabular-money">{formatMs(latest.ms)}</span>
          </span>
        )}

        <span className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold text-ink-muted">
          <LiveDot live={status === "live"} />
          <span className="hidden sm:inline">{STATUS_LABEL[status]}</span>
        </span>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? "Tutup konsol" : "Buka konsol"}
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-ink-muted outline-none transition-colors hover:bg-ink hover:text-ink-foreground focus-visible:ring-3 focus-visible:ring-brand-glow/40"
        >
          <ChevronDown
            aria-hidden
            className={cn("size-4 transition-transform duration-200", !open && "rotate-180")}
            strokeWidth={2.4}
          />
        </button>
      </div>

      {open && (
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-ink-border/70">
          {tab === "runs" && <RunList runs={runs} nodeLabels={nodeLabels} />}
          {tab === "heartbeat" && <HeartbeatList rows={heartbeatRuns} />}
          {tab === "test" && <TestPanel graph={graph} />}
        </div>
      )}
    </Panel>
  );
}

function TabButton({
  tab,
  active,
  icon: Icon,
  count,
  onSelect,
  children,
}: {
  tab: DockTab;
  active: boolean;
  icon: LucideIcon;
  count?: number;
  onSelect: (tab: DockTab) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onSelect(tab)}
      className={cn(
        "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold outline-none transition-colors",
        "focus-visible:ring-3 focus-visible:ring-brand-glow/40",
        active ? "bg-ink text-ink-foreground" : "text-ink-muted hover:text-ink-foreground",
      )}
    >
      <Icon aria-hidden className="size-3.5" strokeWidth={2.4} />
      {children}
      {count !== undefined && <span className="tabular-money text-ink-muted">{count}</span>}
    </button>
  );
}
