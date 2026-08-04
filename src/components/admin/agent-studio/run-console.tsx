"use client";

/**
 * Konsol eksekusi: apa yang benar-benar dijalankan runtime, bukan apa yang
 * digambar di kanvas.
 *
 * Dua tab dengan umur berbeda: event per-node hidup di ring buffer Redis dan
 * hanya menyimpan puluhan terakhir, sedangkan siklus heartbeat dibaca dari tabel
 * karena di situlah bukti bahwa fitur proaktif benar-benar jalan tiap hari.
 */

import { useMemo, useState } from "react";
import { CircleSlash, ListTree, Radio, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState, LiveDot, Tone, relativeTime } from "@/components/admin/ui";
import { RUN_TONES, formatMs, type AgentTelemetryEvent, type HeartbeatRunRow } from "./shared";
import type { StreamStatus } from "./use-agent-stream";

type Tab = "runs" | "heartbeat";

const HEARTBEAT_TONE: Record<string, "positive" | "neutral" | "warning" | "danger"> = {
  sent: "positive",
  saved: "neutral",
  skipped: "warning",
  failed: "danger",
};

const CADENCE_LABEL: Record<string, string> = {
  daily: "Harian",
  weekly: "Mingguan",
  monthly: "Bulanan",
};

export function RunConsole({
  events,
  heartbeatRuns,
  status,
  nodeLabels,
}: {
  events: AgentTelemetryEvent[];
  heartbeatRuns: HeartbeatRunRow[];
  status: StreamStatus;
  /** id node → nama yang tampil di kanvas, supaya log memakai istilah yang sama. */
  nodeLabels: Record<string, string>;
}) {
  const [tab, setTab] = useState<Tab>("runs");

  const runs = useMemo(() => groupRuns(events), [events]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-border/70 px-4 py-2.5">
        <div role="tablist" aria-label="Tampilan konsol" className="flex gap-1">
          <TabButton active={tab === "runs"} onClick={() => setTab("runs")} icon={ListTree}>
            Eksekusi
            <span className="tabular-money ml-1 text-ink-muted">({runs.length})</span>
          </TabButton>
          <TabButton active={tab === "heartbeat"} onClick={() => setTab("heartbeat")} icon={Timer}>
            Siklus proaktif
            <span className="tabular-money ml-1 text-ink-muted">({heartbeatRuns.length})</span>
          </TabButton>
        </div>

        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-muted">
          <LiveDot live={status === "live"} />
          {status === "live"
            ? "Terhubung realtime"
            : status === "denied"
              ? "Socket menolak sesi"
              : status === "polling"
                ? "Mode polling"
                : "Menyambung…"}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "runs" ? (
          runs.length === 0 ? (
            <EmptyState
              icon={Radio}
              title="Belum ada eksekusi tercatat"
              description="Kirim satu pesan dari chat, atau tekan Jalankan tes — node di kanvas akan berkedip berurutan di sini."
            />
          ) : (
            <ul className="divide-y divide-ink-border/50">
              {runs.map((run) => (
                <RunRow key={run.runId} run={run} nodeLabels={nodeLabels} />
              ))}
            </ul>
          )
        ) : heartbeatRuns.length === 0 ? (
          <EmptyState
            icon={CircleSlash}
            title="Belum ada siklus proaktif"
            description="Baris muncul begitu worker heartbeat melewati jam kirim user pertama."
          />
        ) : (
          <ul className="divide-y divide-ink-border/50">
            {heartbeatRuns.map((run) => (
              <li key={run.id} className="flex flex-wrap items-center gap-2.5 px-4 py-2.5 text-xs">
                <Tone tone={HEARTBEAT_TONE[run.status] ?? "neutral"}>{run.status}</Tone>
                <span className="font-semibold text-ink-foreground">
                  {CADENCE_LABEL[run.cadence] ?? run.cadence}
                </span>
                {run.reason && <span className="text-ink-muted">· {run.reason}</span>}
                <span className="tabular-money ml-auto text-ink-muted">
                  {formatMs(run.durationMs ?? undefined)}
                </span>
                <span className="text-ink-muted">{relativeTime(run.startedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof ListTree;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold outline-none transition-colors",
        "focus-visible:ring-3 focus-visible:ring-brand-glow/40",
        active ? "bg-ink text-ink-foreground" : "text-ink-muted hover:text-ink-foreground",
      )}
    >
      <Icon aria-hidden className="size-3.5" strokeWidth={2.4} />
      {children}
    </button>
  );
}

type GroupedRun = {
  runId: string;
  track: string;
  channel: string;
  at: string;
  ms?: number;
  status?: "ok" | "error";
  toolsUsed?: string[];
  nodes: Array<{ nodeId: string; status: keyof typeof RUN_TONES; ms?: number; detail?: string }>;
};

/** Event datang terbaru-dulu dan bisa tercecer; pengelompokan menyusunnya ulang. */
function groupRuns(events: AgentTelemetryEvent[]): GroupedRun[] {
  const map = new Map<string, GroupedRun>();
  const order: string[] = [];

  for (const event of events) {
    let run = map.get(event.runId);
    if (!run) {
      run = { runId: event.runId, track: "chat", channel: "", at: event.at, nodes: [] };
      map.set(event.runId, run);
      order.push(event.runId);
    }

    if (event.type === "run:start") {
      run.track = event.track;
      run.channel = event.channel;
      run.at = event.at;
    } else if (event.type === "run:end") {
      run.status = event.status;
      run.ms = event.ms;
      run.toolsUsed = event.toolsUsed;
    } else if (!run.nodes.some((node) => node.nodeId === event.nodeId)) {
      // Entri pertama per node adalah yang terbaru — status "running" yang sudah
      // disusul "ok" tidak boleh menimpanya.
      run.nodes.push({
        nodeId: event.nodeId,
        status: event.status,
        ms: event.ms,
        detail: event.detail,
      });
    }
  }

  // Node dikumpulkan terbaru-dulu; dibalik supaya terbaca sesuai urutan jalannya.
  for (const run of map.values()) run.nodes.reverse();
  return order.map((id) => map.get(id)!);
}

function RunRow({ run, nodeLabels }: { run: GroupedRun; nodeLabels: Record<string, string> }) {
  const [open, setOpen] = useState(false);

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full cursor-pointer flex-wrap items-center gap-2.5 px-4 py-2.5 text-left text-xs outline-none transition-colors hover:bg-ink/40 focus-visible:ring-3 focus-visible:ring-brand-glow/40"
      >
        <Tone tone={run.status === "error" ? "danger" : run.status === "ok" ? "positive" : "info"}>
          {run.status ?? "berjalan"}
        </Tone>
        <span className="font-semibold text-ink-foreground">
          {run.track === "heartbeat" ? "Laporan proaktif" : "Chat"}
        </span>
        {run.channel && <span className="text-ink-muted">· {run.channel}</span>}
        <span className="tabular-money text-ink-muted">· {run.nodes.length} node</span>
        {run.toolsUsed && run.toolsUsed.length > 0 && (
          <span className="tabular-money text-ink-muted">· {run.toolsUsed.length} tool</span>
        )}
        <span className="tabular-money ml-auto text-ink-muted">{formatMs(run.ms)}</span>
        <span className="text-ink-muted">{relativeTime(run.at)}</span>
      </button>

      {open && (
        <ol className="space-y-1 border-t border-ink-border/40 bg-ink/30 px-4 py-2.5">
          {run.nodes.map((node) => {
            const tone = RUN_TONES[node.status];
            return (
              <li key={node.nodeId} className="flex items-center gap-2 text-[11px]">
                <span className={cn("size-1.5 shrink-0 rounded-full", tone.dot)} />
                <span className="truncate font-semibold text-ink-foreground">
                  {nodeLabels[node.nodeId] ?? node.nodeId}
                </span>
                <span className="text-ink-muted">{tone.label}</span>
                {node.detail && <span className="truncate text-ink-muted">· {node.detail}</span>}
                <span className="tabular-money ml-auto shrink-0 text-ink-muted">
                  {formatMs(node.ms)}
                </span>
              </li>
            );
          })}
          {run.toolsUsed && run.toolsUsed.length > 0 && (
            <li className="pt-1 text-[10px] text-ink-muted">Tool: {run.toolsUsed.join(", ")}</li>
          )}
        </ol>
      )}
    </li>
  );
}
