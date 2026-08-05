"use client";

/**
 * Daftar node — kendali atas tahap, bukan rak pajangan.
 *
 * Versi sebelumnya cuma bisa menambah, dan itu pun tidak pernah bisa: seluruh
 * dua belas tipe node di sini bersifat singleton, sementara susunan bawaan sudah
 * memakai kedua belasnya. Hasilnya tiap baris lahir dalam keadaan mati dengan
 * keterangan "sudah dipakai" — panel yang secara teknis benar tapi tidak punya
 * satu pun tindakan yang bisa dilakukan.
 *
 * Yang diperbaiki bukan warnanya, melainkan pertanyaannya. Pipeline ini bukan
 * kanvas node bebas seperti n8n — tiap tahap memang hanya masuk akal satu kali,
 * dan `llm.reasoner` kedua tidak berarti apa pun buat runtime. Jadi daftar ini
 * menjawab "tahap mana yang sedang dipakai", dan tiap baris membawa tindakannya
 * sendiri: pasang, matikan, nyalakan, cabut, atau lompat ke node-nya di kanvas.
 *
 * Node wajib tidak menyembunyikan tombolnya — ia menunjukkan gembok beserta
 * alasannya. Tombol yang hilang terbaca sebagai fitur rusak; gembok terbaca
 * sebagai aturan.
 */

import { useMemo, useState } from "react";
import { Eye, EyeOff, Lock, Plus, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { inkInput } from "@/components/admin/ui";
import { NodeIcon } from "./node-icon";
import { ACCENTS, type AgentNodeKind, type NodeDefinition } from "./shared";

const TRACK_LABEL = {
  chat: "Jalur chat",
  heartbeat: "Jalur laporan proaktif",
} as const;

/** Node yang sudah berdiri di kanvas — seperlunya saja buat daftar ini. */
export type PaletteNode = { id: string; enabled: boolean };

export function Palette({
  catalogue,
  installed,
  onAdd,
  onFocus,
  onToggle,
  onRemove,
}: {
  catalogue: NodeDefinition[];
  installed: Map<AgentNodeKind, PaletteNode>;
  onAdd: (kind: AgentNodeKind) => void;
  onFocus: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onRemove: (id: string) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalogue;
    return catalogue.filter(
      (definition) =>
        definition.label.toLowerCase().includes(q) ||
        definition.description.toLowerCase().includes(q),
    );
  }, [catalogue, query]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted"
          strokeWidth={2.2}
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cari node…"
          aria-label="Cari node"
          className={cn(inkInput, "h-8 pl-8 text-xs")}
        />
      </div>

      {filtered.length === 0 && (
        <p className="px-1 py-6 text-center text-[11px] text-ink-muted">
          Tidak ada node yang cocok dengan “{query.trim()}”.
        </p>
      )}

      {(["chat", "heartbeat"] as const).map((track) => {
        const items = filtered.filter((definition) => definition.track === track);
        if (items.length === 0) return null;
        const mounted = items.filter((definition) => installed.has(definition.kind)).length;

        return (
          <section key={track}>
            <p className="flex items-baseline gap-1.5 px-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-muted/70">
                {TRACK_LABEL[track]}
              </span>
              <span className="tabular-money ml-auto text-[10px] text-ink-muted/70">
                {mounted}/{items.length}
              </span>
            </p>

            <ul className="mt-1.5 space-y-1">
              {items.map((definition) => (
                <Row
                  key={definition.kind}
                  definition={definition}
                  node={installed.get(definition.kind) ?? null}
                  onAdd={onAdd}
                  onFocus={onFocus}
                  onToggle={onToggle}
                  onRemove={onRemove}
                />
              ))}
            </ul>
          </section>
        );
      })}

      <p className="border-t border-ink-border/60 px-1 pt-2.5 text-[10px] leading-relaxed text-ink-muted/80">
        Tekan <span className="font-bold text-ink-muted">+</span> untuk memasang node sekaligus
        menyambungkannya di urutan yang benar, atau tarik barisnya ke kanvas untuk menaruhnya di
        posisi bebas.
      </p>
    </div>
  );
}

function Row({
  definition,
  node,
  onAdd,
  onFocus,
  onToggle,
  onRemove,
}: {
  definition: NodeDefinition;
  node: PaletteNode | null;
  onAdd: (kind: AgentNodeKind) => void;
  onFocus: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onRemove: (id: string) => void;
}) {
  const accent = ACCENTS[definition.accent];
  const off = node !== null && !node.enabled;

  return (
    <li
      className={cn(
        "flex items-center gap-1 rounded-xl border px-1.5 py-1.5 transition-colors",
        node
          ? "border-ink-border/70 bg-ink/45"
          : "border-dashed border-ink-border/60 hover:border-ink-border hover:bg-ink/30",
      )}
    >
      <button
        type="button"
        draggable={!node}
        onDragStart={(event) => {
          event.dataTransfer.setData("application/ledgerly-node", definition.kind);
          event.dataTransfer.effectAllowed = "move";
        }}
        onClick={() => (node ? onFocus(node.id) : onAdd(definition.kind))}
        title={
          node
            ? `${definition.description}\n\nKlik untuk melompat ke node ini di kanvas.`
            : `${definition.description}\n\nKlik atau tarik untuk memasangnya.`
        }
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-0.5 text-left outline-none",
          "focus-visible:ring-3 focus-visible:ring-brand-glow/40",
          node ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
        )}
      >
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-lg transition-opacity",
            accent.bg,
            accent.text,
            // Warna aksen penuh hanya untuk yang benar-benar berdiri di kanvas:
            // sekali lihat, terbaca mana tahap yang hidup dan mana yang cuma ada
            // di katalog.
            !node && "opacity-45",
            off && "opacity-50 saturate-50",
          )}
        >
          <NodeIcon name={definition.icon} className="size-3.5" />
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-xs font-semibold",
              node ? "text-ink-foreground" : "text-ink-muted",
            )}
          >
            {definition.label}
          </span>
          <span
            className={cn(
              "block truncate text-[10px]",
              off ? "text-amber-200/90" : "text-ink-muted/80",
            )}
          >
            {node ? (off ? "Dimatikan" : `${accent.label} · aktif`) : "Belum dipasang"}
          </span>
        </span>
      </button>

      <span className="flex shrink-0 items-center gap-0.5">
        {!node && (
          <RowButton
            label={`Pasang ${definition.label}`}
            onClick={() => onAdd(definition.kind)}
            tone="add"
          >
            <Plus aria-hidden className="size-3.5" strokeWidth={2.6} />
          </RowButton>
        )}

        {node && definition.required && (
          <span
            title="Node wajib — jalur ini tidak bisa dipublish tanpanya, jadi tidak bisa dimatikan atau dicabut."
            className="grid size-7 place-items-center text-ink-muted/60"
          >
            <Lock aria-hidden className="size-3.5" strokeWidth={2.2} />
            <span className="sr-only">Node wajib</span>
          </span>
        )}

        {node && !definition.required && (
          <>
            <RowButton
              label={off ? `Nyalakan ${definition.label}` : `Matikan ${definition.label}`}
              onClick={() => onToggle(node.id, off)}
            >
              {off ? (
                <EyeOff aria-hidden className="size-3.5" strokeWidth={2.2} />
              ) : (
                <Eye aria-hidden className="size-3.5" strokeWidth={2.2} />
              )}
            </RowButton>
            <RowButton
              label={`Cabut ${definition.label} dari kanvas`}
              onClick={() => onRemove(node.id)}
              tone="danger"
            >
              <Trash2 aria-hidden className="size-3.5" strokeWidth={2.2} />
            </RowButton>
          </>
        )}
      </span>
    </li>
  );
}

function RowButton({
  label,
  onClick,
  tone,
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: "add" | "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg outline-none transition-colors",
        "focus-visible:ring-3 focus-visible:ring-brand-glow/40",
        tone === "danger"
          ? "text-ink-muted hover:bg-rose-500/12 hover:text-rose-300"
          : tone === "add"
            ? "text-ink-muted hover:bg-brand-glow/12 hover:text-brand-glow"
            : "text-ink-muted hover:bg-ink-soft hover:text-ink-foreground",
      )}
    >
      {children}
    </button>
  );
}
