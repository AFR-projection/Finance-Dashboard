"use client";

/**
 * Kartu satu node di kanvas.
 *
 * Kartu ini menampilkan tiga hal sekaligus tanpa saling menutupi: apa node-nya
 * (ikon + kategori), apakah dia aktif, dan apa yang sedang terjadi padanya di
 * run terakhir. Status run muncul sebagai cincin + titik + teks — bukan warna
 * saja — supaya tetap terbaca tanpa persepsi warna.
 */

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { NodeIcon } from "./node-icon";
import {
  ACCENTS,
  RUN_TONES,
  formatMs,
  type AccentName,
  type AgentNodeKind,
  type NodeRunState,
} from "./shared";

/**
 * Node React Flow membawa seluruh keadaan node-nya, bukan cuma tampilannya.
 *
 * `kind`, `config`, dan `rawLabel` adalah data yang nanti diserialisasi kembali
 * jadi graph; sisanya turunan dari katalog yang dihitung sekali saat node dibuat
 * supaya kartu tidak perlu mencari definisinya tiap render.
 */
export type StudioNodeData = {
  kind: AgentNodeKind;
  /** Nama pilihan admin. Kosong berarti pakai label bawaan katalog. */
  rawLabel: string;
  config: Record<string, unknown>;
  enabled: boolean;

  label: string;
  description: string;
  icon: string;
  accent: AccentName;
  hasInput: boolean;
  hasOutput: boolean;
  required: boolean;
  invalid: boolean;
  run?: NodeRunState;
};

export type StudioNode = Node<StudioNodeData, "studio">;

const HANDLE =
  "!size-2.5 !border-2 !border-ink !bg-ink-muted transition-colors hover:!bg-brand-glow";

function NodeCardImpl({ data, selected }: NodeProps<StudioNode>) {
  const accent = ACCENTS[data.accent];
  const run = data.run;
  const tone = run ? RUN_TONES[run.status] : null;

  return (
    <div
      className={cn(
        "w-[232px] rounded-2xl border bg-ink-soft/90 backdrop-blur-sm transition-[box-shadow,border-color,opacity] duration-200",
        "ring-2 ring-transparent",
        data.invalid ? "border-rose-400/60" : "border-ink-border",
        selected && "border-brand-glow/60 shadow-[0_0_0_1px_var(--brand-glow)]",
        tone?.ring,
        run?.status === "running" && "motion-safe:animate-pulse",
        !data.enabled && "opacity-55 saturate-50",
      )}
    >
      {data.hasInput && <Handle type="target" position={Position.Left} className={HANDLE} />}

      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-xl", accent.bg, accent.text)}>
          <NodeIcon name={data.icon} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold leading-tight text-ink-foreground">
            {data.label}
          </p>
          <p className={cn("mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em]", accent.text)}>
            {accent.label}
          </p>
        </div>
        {!data.enabled && (
          <span title="Node dimatikan" className="shrink-0 text-ink-muted">
            <EyeOff aria-hidden className="size-3.5" strokeWidth={2.2} />
            <span className="sr-only">Node dimatikan</span>
          </span>
        )}
      </div>

      <p className="border-t border-ink-border/60 px-3 py-2 text-[11px] leading-snug text-ink-muted">
        {data.enabled ? data.description : "Dilewati saat eksekusi — config-nya tetap tersimpan."}
      </p>

      {tone && (
        <p className="flex items-center gap-1.5 border-t border-ink-border/60 px-3 py-1.5 text-[10px] font-semibold text-ink-muted">
          <span className={cn("size-1.5 shrink-0 rounded-full", tone.dot)} />
          <span className="text-ink-foreground">{tone.label}</span>
          {run?.detail && <span className="truncate">· {run.detail}</span>}
          {run?.ms !== undefined && (
            <span className="tabular-money ml-auto shrink-0">{formatMs(run.ms)}</span>
          )}
        </p>
      )}

      {data.hasOutput && <Handle type="source" position={Position.Right} className={HANDLE} />}
    </div>
  );
}

export const NodeCard = memo(NodeCardImpl);
