"use client";

/**
 * Baris aksi Agent Studio.
 *
 * Publish sengaja dibedakan tajam dari Simpan draft — hanya satu dari keduanya
 * yang mengubah perilaku agent yang saat itu sedang melayani user. Karena itu
 * Publish memakai tombol putih penuh dan meminta konfirmasi, sedangkan sisanya
 * tombol hantu.
 */

import { useState } from "react";
import {
  History,
  Loader2,
  RotateCcw,
  Save,
  Trash2,
  TriangleAlert,
  Upload,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tone, inkButtonGhost, inkButtonPrimary, relativeTime } from "@/components/admin/ui";
import type { GraphIssue, GraphRevision } from "./shared";

export type SaveState = { kind: "idle" | "busy" | "saved" | "error"; message?: string };

export function Toolbar({
  version,
  publishedAt,
  dirty,
  issues,
  state,
  revisions,
  onSaveDraft,
  onDiscardDraft,
  onPublish,
  onRollback,
  onReset,
  onToggleTest,
  testOpen,
}: {
  version: number;
  publishedAt: string | null;
  dirty: boolean;
  issues: GraphIssue[];
  state: SaveState;
  revisions: GraphRevision[];
  onSaveDraft: () => void;
  onDiscardDraft: () => void;
  onPublish: () => void;
  onRollback: (version: number) => void;
  onReset: () => void;
  onToggleTest: () => void;
  testOpen: boolean;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const errors = issues.filter((issue) => issue.level === "error");
  const warnings = issues.filter((issue) => issue.level === "warning");
  const busy = state.kind === "busy";

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Tone tone={version === 0 ? "neutral" : "positive"}>
          {version === 0 ? "Graph bawaan" : `v${version}`}
        </Tone>
        {dirty ? (
          <Tone tone="warning">Ada perubahan belum dipublish</Tone>
        ) : (
          <span className="text-[11px] text-ink-muted">
            {publishedAt ? `Dipublish ${relativeTime(publishedAt)}` : "Belum pernah dipublish"}
          </span>
        )}
        {errors.length > 0 && (
          <Tone tone="danger">
            <TriangleAlert aria-hidden className="size-3" strokeWidth={2.4} />
            {errors.length} error
          </Tone>
        )}
        {warnings.length > 0 && <Tone tone="info">{warnings.length} peringatan</Tone>}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleTest}
            aria-expanded={testOpen}
            className={cn(inkButtonGhost, "h-9 px-3 text-xs", testOpen && "text-ink-foreground")}
          >
            <Wand2 aria-hidden className="size-3.5" strokeWidth={2.2} />
            Jalankan tes
          </button>

          <button
            type="button"
            onClick={() => setHistoryOpen((prev) => !prev)}
            aria-expanded={historyOpen}
            className={cn(inkButtonGhost, "h-9 px-3 text-xs")}
          >
            <History aria-hidden className="size-3.5" strokeWidth={2.2} />
            Riwayat
            <span className="tabular-money">({revisions.length})</span>
          </button>

          <button
            type="button"
            onClick={onReset}
            disabled={busy}
            title="Muat ulang susunan bawaan ke kanvas. Belum mengubah apa pun sampai dipublish."
            className={cn(inkButtonGhost, "h-9 px-3 text-xs")}
          >
            <RotateCcw aria-hidden className="size-3.5" strokeWidth={2.2} />
            Bawaan
          </button>

          {dirty && (
            <button
              type="button"
              onClick={onDiscardDraft}
              disabled={busy}
              className={cn(inkButtonGhost, "h-9 px-3 text-xs hover:border-rose-400/30 hover:text-rose-300")}
            >
              <Trash2 aria-hidden className="size-3.5" strokeWidth={2.2} />
              Buang draft
            </button>
          )}

          <button
            type="button"
            onClick={onSaveDraft}
            disabled={busy || !dirty}
            className={cn(inkButtonGhost, "h-9 px-3 text-xs")}
          >
            <Save aria-hidden className="size-3.5" strokeWidth={2.2} />
            Simpan draft
          </button>

          <button
            type="button"
            onClick={onPublish}
            disabled={busy || errors.length > 0}
            title={
              errors.length > 0
                ? "Perbaiki error dulu — graph yang tidak valid tidak pernah sampai ke runtime."
                : "Menerapkan graph ini ke agent yang sedang melayani user."
            }
            className={cn(inkButtonPrimary, "h-9 px-4 text-xs")}
          >
            {busy ? (
              <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2.4} />
            ) : (
              <Upload aria-hidden className="size-3.5" strokeWidth={2.4} />
            )}
            Publish
          </button>
        </div>
      </div>

      {state.message && (
        <p
          role="status"
          className={cn(
            "rounded-xl border px-3 py-2 text-xs",
            state.kind === "error"
              ? "border-rose-400/30 bg-rose-500/8 text-rose-200"
              : "border-brand-glow/30 bg-brand-glow/8 text-brand-glow",
          )}
        >
          {state.message}
        </p>
      )}

      {issues.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-ink-border/70 bg-ink/40 px-3 py-2.5">
          {issues.map((issue, index) => (
            <li
              key={`${issue.level}-${issue.nodeId ?? "graph"}-${index}`}
              className={cn(
                "flex items-start gap-2 text-[11px] leading-snug",
                issue.level === "error" ? "text-rose-200" : "text-amber-200",
              )}
            >
              <span
                className={cn(
                  "mt-1.5 size-1.5 shrink-0 rounded-full",
                  issue.level === "error" ? "bg-rose-400" : "bg-amber-300",
                )}
              />
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      {historyOpen && (
        <div className="rounded-xl border border-ink-border/70 bg-ink/40">
          {revisions.length === 0 ? (
            <p className="px-3 py-4 text-center text-[11px] text-ink-muted">
              Belum ada revisi. Riwayat mulai terisi setelah publish pertama.
            </p>
          ) : (
            <ul className="divide-y divide-ink-border/40">
              {revisions.map((revision) => (
                <li key={revision.version} className="flex items-center gap-2.5 px-3 py-2 text-[11px]">
                  <span className="tabular-money font-bold text-ink-foreground">
                    v{revision.version}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink-muted">
                    {revision.note || "tanpa catatan"}
                  </span>
                  <span className="shrink-0 text-ink-muted">{relativeTime(revision.createdAt)}</span>
                  <button
                    type="button"
                    onClick={() => onRollback(revision.version)}
                    disabled={busy || revision.version === version}
                    className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-ink-border px-2 text-[10px] font-semibold text-ink-muted outline-none transition-colors hover:text-ink-foreground focus-visible:ring-3 focus-visible:ring-brand-glow/40 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <RotateCcw aria-hidden className="size-3" strokeWidth={2.4} />
                    {revision.version === version ? "aktif" : "Kembalikan"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
