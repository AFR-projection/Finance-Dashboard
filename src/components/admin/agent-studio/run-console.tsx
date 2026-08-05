"use client";

/**
 * Isi konsol eksekusi: apa yang benar-benar dijalankan runtime, bukan apa yang
 * digambar di kanvas.
 *
 * Dua daftar dengan umur berbeda: event per-node hidup di ring buffer Redis dan
 * hanya menyimpan puluhan terakhir, sedangkan siklus heartbeat dibaca dari tabel
 * karena di situlah bukti bahwa fitur proaktif benar-benar jalan tiap hari.
 *
 * Run yang dibuka digambar sebagai waterfall, bukan daftar. Sebuah run yang
 * lambat hampir selalu lambat karena satu node, dan daftar bernomor menuntut
 * pembacanya membandingkan belasan angka untuk menemukan node itu. Pada
 * waterfall, batang terpanjang menjawabnya tanpa dibaca. Offsetnya bukan hasil
 * penjumlahan berurutan melainkan selisih timestamp asli tiap event, jadi jeda
 * di antara dua node — menunggu penyedia, misalnya — ikut terlihat sebagai jarak.
 */

import { useMemo, useState } from "react";
import { CircleSlash, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState, Tone, relativeTime, type ToneName } from "@/components/admin/ui";
import { RUN_TONES, formatMs, type AgentTelemetryEvent, type HeartbeatRunRow } from "./shared";

/**
 * Kunci di sini HURUF BESAR karena itulah yang ditulis enum `HeartbeatStatus`.
 *
 * Versi sebelumnya memakai huruf kecil, jadi setiap baris jatuh ke `?? "neutral"`
 * — termasuk baris FAILED, yang tampil dengan warna yang sama persis dengan
 * baris yang berhasil terkirim.
 */
const HEARTBEAT_TONE: Record<string, ToneName> = {
  SENT: "positive",
  SAVED: "neutral",
  SKIPPED: "warning",
  FAILED: "danger",
  RUNNING: "info",
};

const HEARTBEAT_LABEL: Record<string, string> = {
  SENT: "terkirim",
  SAVED: "disimpan",
  SKIPPED: "dilewati",
  FAILED: "gagal",
  RUNNING: "berjalan",
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
            <Tone tone={HEARTBEAT_TONE[run.status] ?? "neutral"}>
              {HEARTBEAT_LABEL[run.status] ?? run.status}
            </Tone>
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

export type RunNodeEntry = {
  nodeId: string;
  status: keyof typeof RUN_TONES;
  ms?: number;
  detail?: string;
  /** Waktu event dicatat, dipakai menghitung offset batang di waterfall. */
  at: string;
};

export type GroupedRun = {
  runId: string;
  track: string;
  channel: string;
  at: string;
  ms?: number;
  status?: "ok" | "error";
  toolsUsed?: string[];
  nodes: RunNodeEntry[];
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
        at: event.at,
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

      {open && <Waterfall run={run} nodeLabels={nodeLabels} />}
    </li>
  );
}

/**
 * Batang per node pada satu sumbu waktu bersama.
 *
 * Node yang tidak membawa durasi (dilewati, atau masih berjalan saat event
 * ditulis) digambar sebagai penanda tipis di posisinya, bukan dihilangkan —
 * lubang di tengah waterfall lebih membingungkan daripada batang selebar satu
 * pixel.
 */
function Waterfall({ run, nodeLabels }: { run: GroupedRun; nodeLabels: Record<string, string> }) {
  const bars = useMemo(() => {
    const startedAt = new Date(run.at).getTime();
    const entries = run.nodes.map((node) => {
      const endedAt = new Date(node.at).getTime();
      const ms = node.ms ?? 0;
      return { ...node, ms, startOffset: Math.max(0, endedAt - ms - startedAt) };
    });

    // Skala diambil dari data yang benar-benar ada. `run.ms` bisa belum terisi
    // (run masih berjalan) dan bisa lebih pendek dari ujung node terakhir kalau
    // jam proses worker sedikit berbeda dari jam proses web.
    const span = Math.max(
      1,
      run.ms ?? 0,
      ...entries.map((entry) => entry.startOffset + entry.ms),
    );
    return { entries, span };
  }, [run]);

  return (
    <div className="space-y-1 border-t border-ink-border/40 bg-ink/40 px-4 py-2.5">
      {bars.entries.map((entry) => {
        const tone = RUN_TONES[entry.status];
        const left = (entry.startOffset / bars.span) * 100;
        const width = (entry.ms / bars.span) * 100;

        return (
          <div key={entry.nodeId} className="flex items-center gap-2 text-[11px]">
            <span
              className="w-32 shrink-0 truncate font-semibold text-ink-foreground sm:w-44"
              title={entry.detail ? `${nodeLabels[entry.nodeId] ?? entry.nodeId} · ${entry.detail}` : undefined}
            >
              {nodeLabels[entry.nodeId] ?? entry.nodeId}
            </span>

            <span className="relative h-3.5 min-w-0 flex-1 overflow-hidden rounded bg-ink-border/30">
              <span
                className={cn("absolute inset-y-0 rounded-[3px]", tone.dot)}
                style={{
                  left: `${Math.min(99, left)}%`,
                  width: `${Math.max(1.2, Math.min(100 - left, width))}%`,
                }}
              />
            </span>

            <span className="tabular-money w-14 shrink-0 text-right text-ink-muted">
              {formatMs(entry.ms || undefined)}
            </span>
            <span className={cn("w-14 shrink-0 truncate text-right", tone.text)}>{tone.label}</span>
          </div>
        );
      })}

      {run.toolsUsed && run.toolsUsed.length > 0 && (
        <p className="pt-1 text-[10px] text-ink-muted">Tool: {run.toolsUsed.join(", ")}</p>
      )}
    </div>
  );
}
