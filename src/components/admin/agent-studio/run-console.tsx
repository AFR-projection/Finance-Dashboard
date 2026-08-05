"use client";

/**
 * Isi konsol eksekusi: apa yang benar-benar dijalankan runtime, bukan apa yang
 * digambar di kanvas.
 *
 * Dua daftar dengan umur berbeda: event per-node hidup di ring buffer Redis dan
 * hanya menyimpan puluhan terakhir, sedangkan siklus heartbeat dibaca dari tabel
 * karena di situlah bukti bahwa fitur proaktif benar-benar jalan tiap hari.
 *
 * File ini sengaja hanya memegang daftarnya. Tab, indikator live, dan lipatan
 * dok ada di `dock.tsx` — memisahkannya membuat dok bisa menampung tab ketiga
 * (uji coba) tanpa daftar-daftar ini ikut tahu soal itu.
 */

import { useMemo, useState } from "react";
import { CircleSlash, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState, Tone, relativeTime } from "@/components/admin/ui";
import { RUN_TONES, formatMs, type AgentTelemetryEvent, type HeartbeatRunRow } from "./shared";

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

export function RunList({
  runs,
  nodeLabels,
}: {
  runs: GroupedRun[];
  /** id node → nama yang tampil di kanvas, supaya log memakai istilah yang sama. */
  nodeLabels: Record<string, string>;
}) {
  if (runs.length === 0) {
    return (
      <EmptyState
        icon={Radio}
        title="Belum ada eksekusi tercatat"
        description="Kirim satu pesan dari chat, atau tekan Jalankan tes — node di kanvas akan berkedip berurutan di sini."
      />
    );
  }

  return (
    <ul className="divide-y divide-ink-border/50">
      {runs.map((run) => (
        <RunRow key={run.runId} run={run} nodeLabels={nodeLabels} />
      ))}
    </ul>
  );
}

export function HeartbeatList({ rows }: { rows: HeartbeatRunRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CircleSlash}
        title="Belum ada siklus proaktif"
        description="Baris muncul begitu worker heartbeat melewati jam kirim user pertama."
      />
    );
  }

  return (
    <ul className="divide-y divide-ink-border/50">
      {rows.map((run) => (
        <li key={run.id} className="px-4 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-2.5">
            <Tone tone={HEARTBEAT_TONE[run.status] ?? "neutral"}>{run.status}</Tone>
            <span className="font-semibold text-ink-foreground">
              {CADENCE_LABEL[run.cadence] ?? run.cadence}
            </span>
            {run.reason && <span className="text-ink-muted">· {run.reason}</span>}
            {run.attempts > 1 && (
              <span className="tabular-money text-ink-muted">· percobaan ke-{run.attempts}</span>
            )}
            <span className="tabular-money ml-auto text-ink-muted">
              {formatMs(run.durationMs ?? undefined)}
            </span>
            <span className="text-ink-muted">{relativeTime(run.startedAt)}</span>
          </div>

          {/* Pesan asli penyedia. Tanpa baris ini, satu-satunya salinannya ada di
              stdout container — yang di VPS berarti tidak terbaca siapa pun. */}
          {run.detail && (
            <p
              title={run.detail}
              className="mt-1 line-clamp-2 text-[11px] leading-snug text-ink-muted"
            >
              {run.detail}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

export type GroupedRun = {
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
export function groupRuns(events: AgentTelemetryEvent[]): GroupedRun[] {
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

  // Rangkuman status per node dipakai sebagai jejak mini di baris yang tertutup:
  // bentuk sebuah run sering sudah cukup untuk tahu run mana yang perlu dibuka.
  const trail = useMemo(() => run.nodes.slice(0, 12), [run.nodes]);

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

        <span aria-hidden className="flex items-center gap-1">
          {trail.map((node, index) => (
            <span
              key={`${node.nodeId}-${index}`}
              className={cn("size-1.5 rounded-full", RUN_TONES[node.status].dot)}
            />
          ))}
        </span>
        <span className="tabular-money text-ink-muted">{run.nodes.length} node</span>

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
