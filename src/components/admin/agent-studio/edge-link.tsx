"use client";

/**
 * Koneksi antar node, dengan tindakannya sendiri di titik tengah.
 *
 * Ini kebiasaan n8n yang paling layak ditiru: menyisipkan tahap baru di tengah
 * rantai tidak seharusnya berarti "tambah node di pojok, putuskan satu kabel,
 * tarik dua kabel baru". Satu tombol "+" di atas kabelnya sudah cukup — sisanya
 * dikerjakan kanvas.
 *
 * Di keadaan diam yang terlihat hanya titik kecil, bukan sepasang tombol.
 * Sebelas koneksi × dua tombol yang selalu menyala akan menutupi diagram yang
 * justru ingin dibaca; titik itu cukup untuk memberi tahu bahwa ada sesuatu di
 * sana, dan sisanya muncul saat kursor mendekat atau fokus keyboard masuk.
 */

import { createContext, memo, useContext } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import { Plus, X } from "lucide-react";

export type EdgeActions = {
  /** Sisipkan node baru di tengah koneksi ini. `at` = koordinat layar buat menu. */
  onInsert: (edgeId: string, at: { x: number; y: number }) => void;
  onRemove: (edgeId: string) => void;
};

/**
 * Lewat context, bukan lewat `data` tiap edge.
 *
 * Menaruh fungsi di `data` berarti menulis ulang seluruh array edge setiap kali
 * salah satu callback berganti identitas — dan array edge itu juga yang
 * diserialisasi jadi graph, jadi perubahan yang murni kosmetik akan berakhir
 * sebagai "ada perubahan yang belum dipublish".
 */
export const EdgeActionsContext = createContext<EdgeActions | null>(null);

function LinkEdgeImpl({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
}: EdgeProps) {
  const actions = useContext(EdgeActionsContext);
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
  });

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {actions && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            // `nodrag nopan` wajib: tanpa itu, menekan tombol di sini ikut
            // menggeser seluruh kanvas dan kliknya tidak pernah sampai.
            className="nodrag nopan group pointer-events-auto absolute grid h-8 w-16 place-items-center"
          >
            <span
              aria-hidden
              className="size-1.5 rounded-full bg-ink-border transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0"
            />
            <span className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
              <EdgeButton
                label="Sisipkan node di koneksi ini"
                onClick={(event) => actions.onInsert(id, { x: event.clientX, y: event.clientY })}
              >
                <Plus aria-hidden className="size-3" strokeWidth={2.8} />
              </EdgeButton>
              <EdgeButton label="Putuskan koneksi ini" danger onClick={() => actions.onRemove(id)}>
                <X aria-hidden className="size-3" strokeWidth={2.8} />
              </EdgeButton>
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

function EdgeButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: (event: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={
        "grid size-5 cursor-pointer place-items-center rounded-full border border-ink-border bg-ink-soft text-ink-muted outline-none transition-colors focus-visible:ring-3 focus-visible:ring-brand-glow/40 " +
        (danger ? "hover:border-rose-400/50 hover:text-rose-300" : "hover:border-brand-glow/50 hover:text-brand-glow")
      }
    >
      {children}
    </button>
  );
}

export const LinkEdge = memo(LinkEdgeImpl);
