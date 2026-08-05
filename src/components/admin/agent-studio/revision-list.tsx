"use client";

/**
 * Riwayat versi graph, dengan rollback.
 *
 * Dipindah dari popover di topbar kanvas ke halaman sendiri karena rollback
 * adalah satu-satunya aksi di seksi ini yang mengubah perilaku runtime tanpa
 * admin pernah melihat isi yang akan dipasang. Di popover selebar 22rem, yang
 * terbaca hanya nomor versi dan potongan catatan — dan itu tidak cukup untuk
 * memutuskan. Di sini tiap baris punya ruang untuk catatan penuh, pelaku, dan
 * waktunya, dan tombolnya tidak berbagi tempat dengan tombol Publish.
 *
 * Rollback ditulis sebagai versi BARU oleh route API, bukan mundurnya angka
 * versi — jadi kalimat konfirmasinya menyebut itu terang-terangan.
 */

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState, Tone, relativeTime } from "@/components/admin/ui";
import type { GraphRevision } from "./shared";

export function RevisionList({
  revisions,
  activeVersion,
}: {
  revisions: GraphRevision[];
  /** Versi yang sedang dibaca runtime — barisnya tidak bisa dikembalikan ke dirinya sendiri. */
  activeVersion: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyVersion, setBusyVersion] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rollback = useCallback(
    async (version: number) => {
      if (
        !window.confirm(
          `Kembalikan runtime ke susunan v${version}?\n\nIsinya dipasang kembali dan dicatat sebagai versi baru, jadi riwayat ini tidak hilang.`,
        )
      ) {
        return;
      }

      setBusyVersion(version);
      setError(null);
      try {
        const res = await fetch("/api/admin/agent-graph", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "rollback", version }),
        });
        const json = await res.json();
        if (!json.ok) setError(json.error ?? "Rollback gagal.");
        else startTransition(() => router.refresh());
      } catch {
        setError("Tidak bisa menghubungi server.");
      } finally {
        setBusyVersion(null);
      }
    },
    [router],
  );

  if (revisions.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Belum ada revisi"
        description="Riwayat mulai terisi setelah publish pertama. Sampai itu terjadi, runtime memakai susunan bawaan yang ditulis di kode."
      />
    );
  }

  return (
    <>
      {error && (
        <p
          role="alert"
          className="mx-5 mt-4 rounded-xl border border-rose-400/30 bg-rose-500/8 px-3 py-2 text-xs text-rose-200"
        >
          {error}
        </p>
      )}

      <ul className="divide-y divide-ink-border/50">
        {revisions.map((revision) => {
          const active = revision.version === activeVersion;
          const busy = busyVersion === revision.version;

          return (
            <li
              key={revision.version}
              className={cn(
                "flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5",
                active && "bg-brand-glow/5",
              )}
            >
              <span className="tabular-money w-12 shrink-0 text-sm font-bold text-ink-foreground">
                v{revision.version}
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-sm",
                    revision.note ? "text-ink-foreground" : "italic text-ink-muted",
                  )}
                >
                  {revision.note || "tanpa catatan"}
                </span>
                <span className="block text-[11px] text-ink-muted">
                  {relativeTime(revision.createdAt)}
                  {revision.actorUserId && " · oleh admin"}
                </span>
              </span>

              {active ? (
                <Tone tone="positive">dipakai runtime</Tone>
              ) : (
                <button
                  type="button"
                  onClick={() => void rollback(revision.version)}
                  disabled={busy || pending || busyVersion !== null}
                  className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-ink-border px-3 text-xs font-semibold text-ink-muted outline-none transition-colors hover:border-ink-muted/40 hover:text-ink-foreground focus-visible:ring-3 focus-visible:ring-brand-glow/40 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? (
                    <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2.4} />
                  ) : (
                    <RotateCcw aria-hidden className="size-3.5" strokeWidth={2.4} />
                  )}
                  Kembalikan
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
