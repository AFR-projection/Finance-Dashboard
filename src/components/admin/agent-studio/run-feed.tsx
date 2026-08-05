"use client";

/**
 * Halaman Eksekusi: daftar run yang benar-benar dijalankan runtime.
 *
 * Nama node diambil dari graph yang sedang aktif, bukan dari event. Event hanya
 * membawa id node — id yang dibaca sendiri ("llm-reasoner-a4f2") menuntut admin
 * mengingat kanvas dari hafalan. Graph dikirim dari server sebagai peta id → nama
 * supaya log memakai istilah yang sama dengan yang tertulis di kartu.
 *
 * Berbeda dengan kanvas, halaman ini digulir seperti halaman biasa: daftar run
 * panjang tak berbatas, dan memaksanya masuk kotak setinggi viewport hanya
 * menghasilkan dua bilah gulir bersarang.
 */

import { useMemo } from "react";
import { Radio } from "lucide-react";
import { LiveDot, Panel, PanelHeader, Tone } from "@/components/admin/ui";
import { RunList, groupRuns } from "./run-console";
import { formatMs, type AgentTelemetryEvent } from "./shared";
import { useAgentStream, type StreamStatus } from "./use-agent-stream";

const STATUS_LABEL: Record<StreamStatus, string> = {
  live: "Terhubung realtime",
  denied: "Socket menolak sesi",
  polling: "Mode polling",
  connecting: "Menyambung…",
};

export function RunFeed({
  initialEvents,
  nodeLabels,
}: {
  initialEvents: AgentTelemetryEvent[];
  nodeLabels: Record<string, string>;
}) {
  const { events, runSummary, status } = useAgentStream(initialEvents);
  const runs = useMemo(() => groupRuns(events), [events]);

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Jejak eksekusi"
        hint={
          runs.length === 0
            ? "Buffer masih kosong"
            : `${runs.length} run terakhir · p50 ${formatMs(runSummary.p50)} · p95 ${formatMs(runSummary.p95)}`
        }
        icon={Radio}
        actions={
          <>
            {runSummary.error > 0 && (
              <Tone tone="danger">
                <span className="tabular-money">{runSummary.error}</span> gagal
              </Tone>
            )}
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-muted">
              <LiveDot live={status === "live"} />
              <span className="hidden sm:inline">{STATUS_LABEL[status]}</span>
            </span>
          </>
        }
      />
      <RunList runs={runs} nodeLabels={nodeLabels} />
    </Panel>
  );
}
