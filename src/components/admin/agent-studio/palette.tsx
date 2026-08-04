"use client";

/**
 * Daftar node yang bisa ditarik masuk ke kanvas.
 *
 * Setiap entri juga bisa diaktifkan dengan klik/Enter. Drag-and-drop HTML5 tidak
 * bekerja lewat keyboard dan tidak nyaman di layar sentuh, jadi menjadikannya
 * satu-satunya cara menambah node akan mengunci sebagian orang keluar dari
 * halaman ini sepenuhnya.
 */

import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { NodeIcon } from "./node-icon";
import { ACCENTS, type AgentNodeKind, type NodeDefinition } from "./shared";

const TRACK_LABEL = {
  chat: "Jalur chat",
  heartbeat: "Jalur laporan proaktif",
} as const;

export function Palette({
  catalogue,
  used,
  onAdd,
}: {
  catalogue: NodeDefinition[];
  /** Kind yang sudah ada di kanvas — node singleton tidak boleh ditambah dua kali. */
  used: Set<AgentNodeKind>;
  onAdd: (kind: AgentNodeKind) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {(["chat", "heartbeat"] as const).map((track) => {
        const items = catalogue.filter((definition) => definition.track === track);
        return (
          <section key={track}>
            <p className="px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-muted/70">
              {TRACK_LABEL[track]}
            </p>
            <ul className="mt-1.5 space-y-1">
              {items.map((definition) => {
                const accent = ACCENTS[definition.accent];
                const disabled = definition.singleton && used.has(definition.kind);

                return (
                  <li key={definition.kind}>
                    <button
                      type="button"
                      draggable={!disabled}
                      disabled={disabled}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("application/ledgerly-node", definition.kind);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={() => onAdd(definition.kind)}
                      title={
                        disabled
                          ? "Sudah ada di kanvas — node ini hanya boleh satu per jalur."
                          : definition.description
                      }
                      className={cn(
                        "group flex w-full items-center gap-2.5 rounded-xl border border-transparent px-2 py-2 text-left outline-none transition-colors",
                        "focus-visible:ring-3 focus-visible:ring-brand-glow/40",
                        disabled
                          ? "cursor-not-allowed opacity-40"
                          : "cursor-grab hover:border-ink-border hover:bg-ink/50 active:cursor-grabbing",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-7 shrink-0 place-items-center rounded-lg",
                          accent.bg,
                          accent.text,
                        )}
                      >
                        <NodeIcon name={definition.icon} className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-ink-foreground">
                          {definition.label}
                        </span>
                        <span className="block truncate text-[10px] text-ink-muted">
                          {disabled ? "sudah dipakai" : accent.label}
                        </span>
                      </span>
                      {!disabled && (
                        <Plus
                          aria-hidden
                          className="size-3.5 shrink-0 text-ink-muted/0 transition-colors group-hover:text-ink-muted"
                          strokeWidth={2.4}
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
