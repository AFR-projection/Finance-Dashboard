"use client";

/**
 * Ringkasan: keadaan agent sebelum pertanyaan apa pun tentang susunannya.
 *
 * Halaman ini yang dibuka pertama, jadi isinya harus menjawab "apakah semuanya
 * baik-baik saja" tanpa satu klik pun. Tiga hal yang dianggap cukup: angka
 * agregat di rail, keadaan graph yang sedang dipakai runtime, dan node mana yang
 * paling memakan waktu.
 *
 * Peringkat node lambat dihitung dari buffer telemetri yang sama dengan kedipan
 * kanvas — bukan query baru. Konsekuensinya jujur dan disebutkan di layar:
 * peringkat ini bicara tentang beberapa puluh run terakhir, bukan sepanjang masa.
 */

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Gauge, ListTree, Timer, TriangleAlert, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState, LiveDot, Panel, PanelHeader, Tone, relativeTime } from "@/components/admin/ui";
import type { AgentStats } from "@/lib/agent-stats";
import { MetricsRail } from "./metrics-rail";
import { groupRuns } from "./run-console";
import { RUN_TONES, formatMs, type AgentTelemetryEvent, type GraphIssue } from "./shared";
import { useAgentStream } from "./use-agent-stream";

/** Cukup untuk melihat pola tanpa jadi daftar kedua di halaman ringkasan. */
const TOP_NODES = 6;
const RECENT_RUNS = 6;

export type GraphSummary = {
  version: number;
  publishedAt: string | null;
  hasDraft: boolean;
  nodes: number;
  enabledNodes: number;
  edges: number;
  issues: GraphIssue[];
  /** id node → nama di kanvas, untuk peringkat node lambat. */
  labels: Record<string, string>;
};

export function AgentOverview({
  stats,
  initialEvents,
  graph,
}: {
  stats: AgentStats;
  initialEvents: AgentTelemetryEvent[];
  graph: GraphSummary;
}) {
  const { events, nodeHealth, runSummary, status } = useAgentStream(initialEvents);

  const slowest = useMemo(() => {
    const rows = Object.entries(nodeHealth)
      .map(([nodeId, health]) => ({ nodeId, ...health }))
      .filter((row) => row.samples > 0)
      .sort((a, b) => b.avgMs - a.avgMs)
      .slice(0, TOP_NODES);
    return { rows, peak: Math.max(1, ...rows.map((row) => row.avgMs)) };
  }, [nodeHealth]);

  const recent = useMemo(() => groupRuns(events).slice(0, RECENT_RUNS), [events]);
  const errors = graph.issues.filter((issue) => issue.level === "error");
  const warnings = graph.issues.filter((issue) => issue.level === "warning");

  return (
    <div className="space-y-6">
      <MetricsRail initial={stats} runSummary={runSummary} live={status === "live"} />

      <div className="grid gap-5 xl:grid-cols-2">
        {/* ── Susunan yang sedang dipakai runtime ──────────────────────────── */}
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Susunan aktif"
            hint={
              graph.publishedAt
                ? `Dipublish ${relativeTime(graph.publishedAt)}`
                : "Belum pernah dipublish — runtime memakai susunan bawaan"
            }
            icon={Workflow}
            actions={
              <>
                <Tone tone={graph.version === 0 ? "neutral" : "positive"}>
                  {graph.version === 0 ? "bawaan" : `v${graph.version}`}
                </Tone>
                {graph.hasDraft && <Tone tone="warning">ada draft</Tone>}
              </>
            }
          />

          <dl className="grid grid-cols-3 divide-x divide-ink-border/50 border-b border-ink-border/50">
            <Stat label="Node" value={graph.nodes} />
            <Stat
              label="Aktif"
              value={graph.enabledNodes}
              hint={
                graph.enabledNodes < graph.nodes
                  ? `${graph.nodes - graph.enabledNodes} dimatikan`
                  : undefined
              }
            />
            <Stat label="Sambungan" value={graph.edges} />
          </dl>

          <div className="px-5 py-4">
            {graph.issues.length === 0 ? (
              <p className="text-xs text-ink-muted">
                Tidak ada masalah pada susunan ini. Graph yang tidak lolos validasi tidak pernah
                sampai ke runtime, jadi baris ini kosong berarti aman.
              </p>
            ) : (
              <ul className="space-y-2">
                {graph.issues.slice(0, 5).map((issue, index) => (
                  <li
                    key={`${issue.level}-${issue.nodeId ?? "graph"}-${index}`}
                    className={cn(
                      "flex items-start gap-2 text-xs leading-snug",
                      issue.level === "error" ? "text-rose-200" : "text-amber-200",
                    )}
                  >
                    <TriangleAlert
                      aria-hidden
                      className="mt-0.5 size-3.5 shrink-0"
                      strokeWidth={2.4}
                    />
                    <span className="min-w-0">
                      {issue.message}
                      {issue.nodeId && graph.labels[issue.nodeId] && (
                        <span className="text-ink-muted"> · {graph.labels[issue.nodeId]}</span>
                      )}
                    </span>
                  </li>
                ))}
                {graph.issues.length > 5 && (
                  <li className="text-[11px] text-ink-muted">
                    +{graph.issues.length - 5} lagi, semuanya tercantum di topbar kanvas.
                  </li>
                )}
              </ul>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <SectionLink href="/agent/kanvas">
                {errors.length > 0
                  ? "Perbaiki di kanvas"
                  : warnings.length > 0
                    ? "Tinjau di kanvas"
                    : "Buka kanvas"}
              </SectionLink>
              {graph.hasDraft && <SectionLink href="/agent/uji-coba">Uji draft</SectionLink>}
              {graph.version > 0 && <SectionLink href="/agent/versi">Riwayat versi</SectionLink>}
            </div>
          </div>
        </Panel>

        {/* ── Node paling memakan waktu ────────────────────────────────────── */}
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Node paling lambat"
            hint={
              slowest.rows.length === 0
                ? "Menunggu run pertama"
                : `Rata-rata dari ${runSummary.total || "beberapa"} run terakhir di buffer`
            }
            icon={Timer}
            actions={<LiveDot live={status === "live"} />}
          />

          {slowest.rows.length === 0 ? (
            <EmptyState
              icon={Gauge}
              title="Belum ada durasi tercatat"
              description="Angka muncul begitu satu run lewat — kirim pesan dari chat, atau pakai halaman Uji coba."
            />
          ) : (
            <ul className="divide-y divide-ink-border/50">
              {slowest.rows.map((row) => (
                <li key={row.nodeId} className="flex items-center gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-ink-foreground">
                      {graph.labels[row.nodeId] ?? row.nodeId}
                    </span>
                    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-ink">
                      <span
                        className={cn(
                          "block h-full rounded-full",
                          row.errors > 0 ? "bg-rose-400" : "bg-brand-glow",
                        )}
                        style={{ width: `${Math.max(3, (row.avgMs / slowest.peak) * 100)}%` }}
                      />
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span className="tabular-money block text-xs font-bold text-ink-foreground">
                      {formatMs(row.avgMs)}
                    </span>
                    <span className="tabular-money block text-[10px] text-ink-muted">
                      {row.errors > 0
                        ? `${row.errors} gagal`
                        : row.skipped > 0
                          ? `${row.skipped} dilewati`
                          : `${row.samples}×`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── Run terakhir ───────────────────────────────────────────────────── */}
      <Panel className="overflow-hidden">
        <PanelHeader
          title="Run terakhir"
          hint="Enam paling baru; jejak per node ada di halaman Eksekusi"
          icon={ListTree}
          actions={<SectionLink href="/agent/eksekusi">Semua eksekusi</SectionLink>}
        />

        {recent.length === 0 ? (
          <EmptyState
            icon={ListTree}
            title="Belum ada eksekusi tercatat"
            description="Buffer terisi begitu ada pesan masuk dari web atau Telegram."
          />
        ) : (
          <ul className="divide-y divide-ink-border/50">
            {recent.map((run) => (
              <li
                key={run.runId}
                className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-5 py-3 text-xs"
              >
                <Tone
                  tone={run.status === "error" ? "danger" : run.status === "ok" ? "positive" : "info"}
                >
                  {run.status ?? "berjalan"}
                </Tone>
                <span className="font-semibold text-ink-foreground">
                  {run.track === "heartbeat" ? "Laporan proaktif" : "Chat"}
                </span>
                {run.channel && <span className="text-ink-muted">· {run.channel}</span>}

                <span aria-hidden className="flex items-center gap-1">
                  {run.nodes.slice(0, 12).map((node, index) => (
                    <span
                      key={`${node.nodeId}-${index}`}
                      className={cn("size-1.5 rounded-full", RUN_TONES[node.status].dot)}
                    />
                  ))}
                </span>

                <span className="tabular-money ml-auto text-ink-muted">{formatMs(run.ms)}</span>
                <span className="text-ink-muted">{relativeTime(run.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="min-w-0 px-5 py-3.5">
      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">{label}</dt>
      <dd className="tabular-money mt-1 text-xl font-bold leading-none text-ink-foreground">
        {value}
      </dd>
      {hint && <p className="mt-1 truncate text-[10px] text-amber-200">{hint}</p>}
    </div>
  );
}

function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-ink-border px-3 text-xs font-semibold text-ink-muted outline-none transition-colors hover:border-ink-muted/40 hover:text-ink-foreground focus-visible:ring-3 focus-visible:ring-brand-glow/40"
    >
      {children}
      <ArrowRight aria-hidden className="size-3.5" strokeWidth={2.4} />
    </Link>
  );
}
