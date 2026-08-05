"use client";

/**
 * Rail metrik: kondisi agent dalam satu baris, di atas kanvas.
 *
 * Halaman ini sebelumnya bisa menjawab "bagaimana agent disusun" tapi tidak
 * "bagaimana keadaannya". Rail menjawab yang kedua, dan sengaja ditaruh di atas
 * kanvas: itu pertanyaan yang muncul lebih dulu setiap kali halaman dibuka.
 *
 * Dua umur data digabung dalam satu baris tanpa menyembunyikan bedanya. Angka
 * agregat 24 jam datang dari tabel dan disegarkan berkala; keberhasilan dan
 * latensi dihitung dari buffer telemetri yang sama dengan kedipan kanvas,
 * sehingga bergerak seketika saat ada run masuk. Sel yang hidup ditandai titik
 * live — bukan supaya terlihat canggih, tapi supaya angka yang tertinggal satu
 * menit tidak disangka realtime.
 */

import { useCallback, useEffect, useState } from "react";
import { Activity, BrainCircuit, Coins, Gauge, Radio, Timer } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { LiveDot, compactNumber } from "@/components/admin/ui";
import type { AgentStats } from "@/lib/agent-stats";
import { formatMs } from "./shared";
import type { RunSummary } from "./use-agent-stream";

/** Agregat 24 jam nyaris tidak bergerak menit ke menit; polling lebih rapat hanya membebani Neon. */
const REFRESH_MS = 60_000;

export function MetricsRail({
  initial,
  runSummary,
  live,
}: {
  initial: AgentStats;
  runSummary: RunSummary;
  live: boolean;
}) {
  const [stats, setStats] = useState(initial);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/agent-stats", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setStats(json.data as AgentStats);
    } catch {
      // Angka lama lebih baik daripada baris yang tiba-tiba kosong.
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const totalCalls = stats.calls.chat + stats.calls.heartbeat;
  const successRate =
    runSummary.total > 0 ? Math.round((runSummary.ok / runSummary.total) * 100) : null;
  const beat = stats.heartbeat;
  const beatTotal = beat.sent + beat.saved + beat.skipped + beat.failed;
  const topModel = stats.models[0];

  return (
    <div className="grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-border bg-ink-border/60 sm:grid-cols-3 xl:grid-cols-6">
      <Cell
        icon={Activity}
        label={`Panggilan ${stats.windowHours} jam`}
        value={compactNumber(totalCalls)}
        detail={
          totalCalls > 0
            ? `${compactNumber(stats.calls.chat)} chat · ${compactNumber(stats.calls.heartbeat)} proaktif`
            : "belum ada panggilan"
        }
      >
        <Sparkline series={stats.series} />
      </Cell>

      <Cell
        icon={Gauge}
        label="Keberhasilan run"
        live={live}
        value={successRate === null ? "—" : `${successRate}%`}
        detail={
          runSummary.total === 0
            ? "menunggu run pertama"
            : `${runSummary.ok} selesai · ${runSummary.error} gagal`
        }
        tone={successRate !== null && successRate < 90 ? "danger" : undefined}
      />

      <Cell
        icon={Timer}
        label="Latensi run"
        live={live}
        value={runSummary.total > 0 ? formatMs(runSummary.p50) : "—"}
        detail={
          runSummary.total > 0 ? `p95 ${formatMs(runSummary.p95)}` : "belum ada run tercatat"
        }
      />

      <Cell
        icon={Coins}
        label="Token terpakai"
        value={compactNumber(stats.tokens.prompt + stats.tokens.output)}
        detail={`${compactNumber(stats.tokens.prompt)} masuk · ${compactNumber(stats.tokens.output)} keluar`}
      />

      <Cell
        icon={BrainCircuit}
        label="Model teratas"
        value={topModel ? shortModel(topModel.model) : "—"}
        detail={
          topModel
            ? `${compactNumber(topModel.calls)} panggilan${stats.models.length > 1 ? ` · +${stats.models.length - 1} model lain` : ""}`
            : "belum ada model terpakai"
        }
      />

      <Cell
        icon={Radio}
        label="Siklus proaktif"
        value={beatTotal === 0 ? "—" : compactNumber(beat.sent + beat.saved)}
        detail={
          beatTotal === 0
            ? "belum ada siklus berjalan"
            : `${beat.skipped} dilewati · ${beat.failed} gagal`
        }
        tone={beat.failed > 0 ? "danger" : undefined}
      />
    </div>
  );
}

function Cell({
  icon: Icon,
  label,
  value,
  detail,
  tone,
  live,
  children,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone?: "danger";
  live?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative min-w-0 bg-ink-soft/60 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">
        <Icon aria-hidden className="size-3 shrink-0" strokeWidth={2.4} />
        <span className="truncate">{label}</span>
        {live && <LiveDot className="ml-auto shrink-0" />}
      </p>

      <p
        className={cn(
          "tabular-money mt-1.5 truncate text-lg font-bold leading-none tracking-[-0.02em]",
          tone === "danger" ? "text-rose-300" : "text-ink-foreground",
        )}
      >
        {value}
      </p>

      <p className="mt-1 truncate text-[10px] leading-tight text-ink-muted">{detail}</p>
      {children}
    </div>
  );
}

/**
 * Sparkline 24 jam sebagai batang, bukan garis.
 *
 * Sebagian besar jam di aplikasi sekecil ini bernilai nol, dan garis yang
 * menghubungkan nol ke nol menggambar lantai datar yang tampak seperti data
 * hilang. Batang menyatakan "jam ini memang kosong" dengan jujur, dan lonjakan
 * satu jam tetap terbaca sebagai satu lonjakan.
 */
function Sparkline({ series }: { series: number[] }) {
  const max = Math.max(1, ...series);
  return (
    <div
      className="mt-2 flex h-5 items-end gap-px"
      role="img"
      aria-label={`Panggilan per jam selama ${series.length} jam terakhir, tertinggi ${max}`}
    >
      {series.map((value, index) => (
        <span
          key={index}
          className={cn(
            "min-w-0 flex-1 rounded-[1px]",
            value > 0 ? "bg-brand-glow/70" : "bg-ink-border/70",
          )}
          style={{ height: value > 0 ? `${Math.max(12, (value / max) * 100)}%` : "2px" }}
        />
      ))}
    </div>
  );
}

/** `anthropic/claude-opus-4` → `claude-opus-4`. Awalan penyedia sama untuk semua baris, jadi tidak membedakan apa pun. */
function shortModel(model: string) {
  const tail = model.includes("/") ? model.slice(model.lastIndexOf("/") + 1) : model;
  return tail.length > 22 ? `${tail.slice(0, 22)}…` : tail;
}
