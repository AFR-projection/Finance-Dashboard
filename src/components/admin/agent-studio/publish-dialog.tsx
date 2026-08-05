"use client";

/**
 * Konfirmasi publish yang menyebutkan isinya.
 *
 * Yang digantikan: `window.confirm("Publish graph ini?")`. Pertanyaan itu tidak
 * bisa dijawab dengan bertanggung jawab, karena satu-satunya yang tahu isi
 * perubahan adalah orang yang mengingat apa yang ia sentuh — dan draft bisa
 * berumur berhari-hari. Dialog ini membacakan daftarnya: node mana, field mana,
 * dari nilai apa ke nilai apa.
 *
 * Kolom catatan bukan hiasan. Route publish sudah lama menyimpan `note` pada tiap
 * revisi, tapi UI tidak pernah mengirimnya, jadi seluruh riwayat rollback
 * berbunyi "tanpa catatan" — daftar nomor versi tanpa satu pun petunjuk versi
 * mana yang harus dituju saat sesuatu rusak.
 */

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CircleDot,
  Eye,
  EyeOff,
  Link2,
  Loader2,
  Minus,
  Move,
  PenLine,
  Plus,
  Upload,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { inkInput } from "@/components/admin/ui";
import type { GraphChange, GraphDiff } from "./graph-diff";

export function PublishDialog({
  diff,
  version,
  busy,
  onCancel,
  onConfirm,
}: {
  diff: GraphDiff;
  version: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const noteRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    noteRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const count = diff.changes.length;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-title"
        className="flex max-h-[min(38rem,85svh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-ink-border bg-ink-soft shadow-2xl shadow-black/60"
      >
        <header className="flex shrink-0 items-start gap-2.5 border-b border-ink-border/70 px-4 py-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-ink text-brand-glow">
            <Upload aria-hidden className="size-4" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="publish-title" className="text-sm font-bold text-ink-foreground">
              Publish sebagai v{version + 1}
            </h2>
            <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">
              {count === 0
                ? "Tidak ada perubahan yang menyentuh runtime."
                : `${count} perubahan langsung berlaku untuk agent yang sedang melayani user.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Tutup"
            className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg text-ink-muted outline-none transition-colors hover:bg-ink hover:text-ink-foreground focus-visible:ring-3 focus-visible:ring-brand-glow/40 disabled:opacity-40"
          >
            <X aria-hidden className="size-3.5" strokeWidth={2.4} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {count === 0 ? (
            <p className="rounded-xl border border-ink-border/70 bg-ink/40 px-3 py-3 text-xs leading-relaxed text-ink-muted">
              {diff.moved > 0
                ? `Hanya ${diff.moved} node yang berpindah tempat. Posisi tidak dibaca runtime, jadi publish ini tidak akan mengubah perilaku agent sama sekali — hanya menyimpan tata letaknya.`
                : "Draft ini identik dengan yang sedang dipublish."}
            </p>
          ) : (
            <ul className="space-y-1">
              {diff.changes.map((change, index) => (
                <ChangeRow key={`${change.kind}-${change.nodeId}-${index}`} change={change} />
              ))}
            </ul>
          )}

          {count > 0 && diff.moved > 0 && (
            <p className="mt-2.5 flex items-center gap-1.5 text-[10px] text-ink-muted/70">
              <Move aria-hidden className="size-3 shrink-0" strokeWidth={2.2} />
              {diff.moved} node juga berpindah tempat — tidak mempengaruhi runtime.
            </p>
          )}
        </div>

        <footer className="shrink-0 space-y-2.5 border-t border-ink-border/70 px-4 py-3">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">
              Catatan revisi
            </span>
            <input
              ref={noteRef}
              type="text"
              value={note}
              maxLength={200}
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && !busy && onConfirm(note.trim())}
              placeholder="mis. naikkan batas putaran jadi 8"
              className={cn(inkInput, "h-9 text-xs")}
            />
            <span className="mt-1 block text-[10px] text-ink-muted/70">
              Muncul di riwayat revisi — inilah yang menjelaskan versi mana yang harus dituju saat
              perlu rollback.
            </span>
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="inline-flex h-9 cursor-pointer items-center rounded-xl border border-ink-border px-3.5 text-xs font-semibold text-ink-muted outline-none transition-colors hover:text-ink-foreground focus-visible:ring-3 focus-visible:ring-brand-glow/40 disabled:opacity-40"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => onConfirm(note.trim())}
              disabled={busy}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-white px-3.5 text-xs font-bold text-ink outline-none transition-colors hover:bg-white/90 focus-visible:ring-3 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2.4} />
              ) : (
                <Upload aria-hidden className="size-3.5" strokeWidth={2.4} />
              )}
              Terapkan ke runtime
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/** Ikon + warna per jenis perubahan. Merah hanya untuk yang menghapus atau mematikan. */
const CHANGE_STYLE: Record<GraphChange["kind"], { icon: LucideIcon; tone: string }> = {
  added: { icon: Plus, tone: "text-emerald-300" },
  removed: { icon: Minus, tone: "text-rose-300" },
  toggled: { icon: CircleDot, tone: "text-amber-300" },
  renamed: { icon: PenLine, tone: "text-ink-muted" },
  config: { icon: CircleDot, tone: "text-sky-300" },
  edge: { icon: Link2, tone: "text-violet-300" },
};

function ChangeRow({ change }: { change: GraphChange }) {
  const style =
    change.kind === "toggled"
      ? { icon: change.enabled ? Eye : EyeOff, tone: change.enabled ? "text-emerald-300" : "text-amber-300" }
      : CHANGE_STYLE[change.kind];
  const Icon = style.icon;

  return (
    <li className="flex items-start gap-2 rounded-lg px-1.5 py-1.5 text-[11px] leading-snug odd:bg-ink/30">
      <Icon aria-hidden className={cn("mt-0.5 size-3 shrink-0", style.tone)} strokeWidth={2.6} />
      <span className="min-w-0 flex-1">
        <span className="font-semibold text-ink-foreground">{change.label}</span>{" "}
        <span className="text-ink-muted">{describe(change)}</span>
      </span>
    </li>
  );
}

function describe(change: GraphChange): React.ReactNode {
  switch (change.kind) {
    case "added":
      return "ditambahkan ke graph";
    case "removed":
      return "dihapus dari graph";
    case "toggled":
      return change.enabled ? "dinyalakan" : "dimatikan — akan dilewati saat eksekusi";
    case "renamed":
      return `diganti nama dari "${change.from}"`;
    case "edge":
      return change.added ? "— sambungan baru" : "— sambungan diputus";
    case "config":
      return (
        <>
          · {change.field}:{" "}
          <span className="tabular-money text-ink-foreground/80">{change.from}</span>
          <ArrowRight aria-hidden className="mx-1 inline size-3 -translate-y-px" strokeWidth={2.6} />
          <span className="tabular-money font-semibold text-ink-foreground">{change.to}</span>
        </>
      );
  }
}
