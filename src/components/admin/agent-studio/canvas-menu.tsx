"use client";

/**
 * Menu melayang di atas kanvas.
 *
 * Dipakai dua tempat dengan aturan yang sama: klik kanan pada node, dan tombol
 * "+" di tengah sebuah koneksi. Keduanya muncul di koordinat kursor, jadi
 * posisinya harus dijepit ke dalam viewport sesudah diukur — menu setinggi 240px
 * yang dibuka 40px dari dasar layar akan separuh terpotong, dan item terakhirnya
 * justru yang paling sering dicari (Hapus).
 *
 * Item yang tidak boleh dipakai tetap dirender dengan alasannya, bukan
 * dihilangkan: menu yang isinya berubah-ubah memaksa admin menebak apakah sebuah
 * tindakan tidak ada atau sedang tidak berlaku.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function CanvasMenu({
  x,
  y,
  label,
  onClose,
  children,
}: {
  x: number;
  y: number;
  /** Judul kecil di atas daftar — menjawab "menu ini soal apa". */
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
    });
  }, [x, y]);

  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-50 w-60 overflow-hidden rounded-2xl border border-ink-border bg-ink-soft/95 py-1 shadow-2xl shadow-black/50 backdrop-blur-xl"
    >
      <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted/70">
        {label}
      </p>
      <div className="max-h-[min(22rem,60svh)] overflow-y-auto">{children}</div>
    </div>
  );
}

export function CanvasMenuItem({
  icon: Icon,
  label,
  hint,
  danger,
  disabledReason,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  danger?: boolean;
  /** Terisi = item dimatikan, dan teksnya yang menggantikan `hint`. */
  disabledReason?: string;
  onClick: () => void;
}) {
  const disabled = Boolean(disabledReason);

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      title={disabledReason}
      className={cn(
        "flex w-full items-start gap-2.5 px-3 py-2 text-left outline-none transition-colors",
        "focus-visible:bg-ink focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-brand-glow/40",
        disabled
          ? "cursor-not-allowed opacity-45"
          : danger
            ? "cursor-pointer text-rose-300 hover:bg-rose-500/12"
            : "cursor-pointer hover:bg-ink",
      )}
    >
      <Icon
        aria-hidden
        className={cn("mt-0.5 size-3.5 shrink-0", !danger && "text-ink-muted")}
        strokeWidth={2.2}
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-xs font-semibold",
            danger && !disabled ? "text-rose-300" : "text-ink-foreground",
          )}
        >
          {label}
        </span>
        {(disabledReason ?? hint) && (
          <span className="mt-0.5 block text-[10px] leading-snug text-ink-muted">
            {disabledReason ?? hint}
          </span>
        )}
      </span>
    </button>
  );
}
