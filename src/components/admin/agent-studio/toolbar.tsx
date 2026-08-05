"use client";

/**
 * Topbar Agent Studio.
 *
 * Publish sengaja dibedakan tajam dari Simpan draft — hanya satu dari keduanya
 * yang mengubah perilaku agent yang saat itu sedang melayani user. Karena itu
 * Publish memakai tombol putih penuh dan meminta konfirmasi, sedangkan sisanya
 * tombol hantu.
 *
 * Daftar issue dan pesan status tidak disisipkan sebagai blok di bawah baris
 * aksi. Keduanya muncul dan hilang mengikuti apa yang admin lakukan, dan sebagai
 * blok inline mereka mendorong kanvas turun-naik setiap kali. Jadi issue jadi
 * popover absolute, dan pesan status menempati slot bertinggi tetap di bawah judul.
 */

import { useEffect, useId, useRef, useState } from "react";
import {
  Activity,
  ChevronDown,
  Keyboard,
  LayoutGrid,
  Loader2,
  MoreHorizontal,
  Redo2,
  RotateCcw,
  Save,
  Trash2,
  TriangleAlert,
  Undo2,
  Upload,
  Wand2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { LiveDot, Tone, relativeTime } from "@/components/admin/ui";
import type { GraphIssue } from "./shared";

export type SaveState = { kind: "idle" | "busy" | "saved" | "error"; message?: string };

/** Sumber tunggal daftar pintasan; handler-nya dipasang di workspace. */
const SHORTCUTS: Array<[string, string]> = [
  ["Ctrl+S", "Simpan draft"],
  ["Ctrl+Z", "Urungkan"],
  ["Ctrl+Shift+Z", "Ulangi"],
  ["Ctrl+Shift+L", "Rapikan susunan"],
  ["Ctrl+Shift+H", "Kesehatan node"],
  ["Ctrl+Enter", "Publish"],
  ["Delete", "Hapus node terpilih"],
];

/**
 * Tombol setinggi 9 dengan sudut `xl`, bukan primitif `inkButton*` dari panel.
 *
 * Yang di `ui.tsx` dirancang untuk badan halaman: tinggi 11 dan sudut `2xl`.
 * Dipakai di baris sepadat ini, tingginya memakan sepertiga topbar dan sudutnya
 * membuat tombol terlihat seperti pil yang mengapung sendiri-sendiri.
 */
const BAR_GHOST =
  "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-ink-border px-2.5 text-xs font-semibold text-ink-muted outline-none transition-colors hover:border-ink-muted/40 hover:text-ink-foreground focus-visible:ring-3 focus-visible:ring-brand-glow/40 disabled:cursor-not-allowed disabled:opacity-40";

const BAR_PRIMARY =
  "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-white px-3.5 text-xs font-bold text-ink outline-none transition-all hover:bg-white/90 focus-visible:ring-3 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-50";

const MENU_ITEM =
  "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-ink-muted outline-none transition-colors hover:bg-ink-soft hover:text-ink-foreground focus-visible:ring-3 focus-visible:ring-brand-glow/40 disabled:cursor-not-allowed disabled:opacity-40";

export function Toolbar({
  version,
  publishedAt,
  dirty,
  issues,
  state,
  onSaveDraft,
  onDiscardDraft,
  onPublish,
  onReset,
  onTest,
  live,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onTidy,
  healthOn,
  onToggleHealth,
}: {
  version: number;
  publishedAt: string | null;
  dirty: boolean;
  issues: GraphIssue[];
  state: SaveState;
  onSaveDraft: () => void;
  onDiscardDraft: () => void;
  onPublish: () => void;
  onReset: () => void;
  onTest: () => void;
  /** Socket telemetri hidup. Dulu ditampilkan dok bawah; dok sudah tidak ada. */
  live: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onTidy: () => void;
  healthOn: boolean;
  onToggleHealth: () => void;
}) {
  const errors = issues.filter((issue) => issue.level === "error");
  const warnings = issues.filter((issue) => issue.level === "warning");
  const busy = state.kind === "busy";

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-ink-border bg-ink-soft/50 px-3 py-2 backdrop-blur-xl">
      {/*
        Indikator live menggantikan ikon seksi yang dulu di sini: identitas
        "Agent Studio" sudah dibawa baris tab di atas, sedangkan status socket
        kehilangan tempatnya waktu dok bawah dihapus. Yang dipajang di sudut
        paling mudah dilihat sebaiknya hal yang berubah, bukan yang tetap.
      */}
      <span
        title={live ? "Telemetri realtime tersambung" : "Socket terputus — jatuh ke polling"}
        className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink"
      >
        <LiveDot live={live} />
        <span className="sr-only">{live ? "Realtime aktif" : "Realtime terputus"}</span>
      </span>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-sm font-bold tracking-[-0.01em] text-ink-foreground">
            Kanvas
          </h1>
          <Tone tone={version === 0 ? "neutral" : "positive"}>
            {version === 0 ? "bawaan" : `v${version}`}
          </Tone>
          {dirty && <Tone tone="warning">draft</Tone>}
        </div>
        {/* Slot bertinggi tetap: pesan status datang dan pergi tanpa menggeser apa pun. */}
        <p
          role="status"
          className={cn(
            "min-h-4 truncate text-[11px] leading-4",
            state.kind === "error"
              ? "text-rose-300"
              : state.kind === "saved"
                ? "text-brand-glow"
                : "text-ink-muted",
          )}
        >
          {state.message ??
            (dirty
              ? "Perubahan belum menyentuh runtime — Publish yang menerapkannya."
              : publishedAt
                ? `Dipublish ${relativeTime(publishedAt)}`
                : "Belum pernah dipublish — runtime memakai susunan bawaan.")}
        </p>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {issues.length > 0 && (
          <Popover
            width="w-80"
            label={
              <>
                {errors.length > 0 ? (
                  <>
                    <TriangleAlert aria-hidden className="size-3.5" strokeWidth={2.4} />
                    <span className="tabular-money">{errors.length}</span>
                    <span className="hidden sm:inline">error</span>
                  </>
                ) : (
                  <>
                    <span className="tabular-money">{warnings.length}</span>
                    <span className="hidden sm:inline">peringatan</span>
                  </>
                )}
              </>
            }
            triggerClass={cn(
              errors.length > 0
                ? "border-rose-400/40 text-rose-300 hover:border-rose-400/60 hover:text-rose-200"
                : "border-amber-400/40 text-amber-200 hover:border-amber-400/60",
            )}
          >
            <ul className="space-y-1.5">
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
          </Popover>
        )}

        {/*
          Kelompok alat kanvas. Semuanya punya pintasan keyboard, dan tetap
          dipasang sebagai tombol karena pintasan yang tidak punya wujud terlihat
          hanya berguna bagi orang yang sudah tahu ia ada.
        */}
        <div className="hidden items-center gap-1.5 md:flex">
          <IconButton
            icon={Undo2}
            label="Urungkan (Ctrl+Z)"
            disabled={!canUndo}
            onClick={onUndo}
          />
          <IconButton
            icon={Redo2}
            label="Ulangi (Ctrl+Shift+Z)"
            disabled={!canRedo}
            onClick={onRedo}
          />
          <IconButton icon={LayoutGrid} label="Rapikan susunan (Ctrl+Shift+L)" onClick={onTidy} />
          <IconButton
            icon={Activity}
            label={
              healthOn
                ? "Sembunyikan kesehatan node (Ctrl+Shift+H)"
                : "Tampilkan kesehatan node di kartu (Ctrl+Shift+H)"
            }
            pressed={healthOn}
            onClick={onToggleHealth}
          />
        </div>

        <span aria-hidden className="mx-0.5 hidden h-6 w-px bg-ink-border md:block" />

        <button
          type="button"
          onClick={onTest}
          title="Menyimpan draft lalu membuka halaman uji coba."
          className={BAR_GHOST}
        >
          <Wand2 aria-hidden className="size-3.5" strokeWidth={2.2} />
          <span className="hidden sm:inline">Uji coba</span>
        </button>

        {/* Riwayat revisi dan tombol rollback-nya pindah ke halaman Versi. Di sini
            ia cuma popover sempit yang menampilkan potongan catatan — dan rollback
            adalah aksi yang paling tidak pantas dipicu dari dalam popover sempit. */}

        <Popover
          width="w-64"
          hideChevron
          srLabel="Aksi lain"
          label={<MoreHorizontal aria-hidden className="size-4" strokeWidth={2.2} />}
        >
          {(close) => (
            <div className="-mx-1 space-y-0.5">
              {/* Duplikat pintasan untuk layar sempit, tempat kelompok ikon di atas disembunyikan. */}
              <div className="space-y-0.5 md:hidden">
                <MenuItem
                  icon={Undo2}
                  disabled={!canUndo}
                  onClick={() => {
                    close();
                    onUndo();
                  }}
                >
                  Urungkan
                </MenuItem>
                <MenuItem
                  icon={LayoutGrid}
                  onClick={() => {
                    close();
                    onTidy();
                  }}
                >
                  Rapikan susunan
                </MenuItem>
                <MenuItem
                  icon={Activity}
                  onClick={() => {
                    close();
                    onToggleHealth();
                  }}
                >
                  {healthOn ? "Sembunyikan kesehatan node" : "Tampilkan kesehatan node"}
                </MenuItem>
                <span aria-hidden className="my-1 block h-px bg-ink-border/60" />
              </div>

              <MenuItem
                icon={RotateCcw}
                disabled={busy}
                onClick={() => {
                  close();
                  onReset();
                }}
              >
                Muat susunan bawaan
                <span className="mt-0.5 block text-[10px] font-normal text-ink-muted/70">
                  Hanya mengisi kanvas — runtime belum berubah sampai dipublish.
                </span>
              </MenuItem>
              <MenuItem
                icon={Trash2}
                danger
                disabled={busy || !dirty}
                onClick={() => {
                  close();
                  onDiscardDraft();
                }}
              >
                Buang draft
                <span className="mt-0.5 block text-[10px] font-normal text-ink-muted/70">
                  Kembali ke susunan yang sedang dipublish.
                </span>
              </MenuItem>

              <span aria-hidden className="my-1 block h-px bg-ink-border/60" />

              <div className="px-2.5 py-1.5">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">
                  <Keyboard aria-hidden className="size-3" strokeWidth={2.4} />
                  Pintasan
                </p>
                <dl className="mt-1.5 space-y-1">
                  {SHORTCUTS.map(([keys, what]) => (
                    <div key={keys} className="flex items-center gap-2 text-[11px]">
                      <dt className="w-24 shrink-0">
                        <kbd className="rounded border border-ink-border bg-ink px-1.5 py-0.5 font-mono text-[10px] text-ink-foreground">
                          {keys}
                        </kbd>
                      </dt>
                      <dd className="min-w-0 flex-1 text-ink-muted">{what}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          )}
        </Popover>

        <span aria-hidden className="mx-0.5 h-6 w-px bg-ink-border" />

        <button
          type="button"
          onClick={onSaveDraft}
          disabled={busy || !dirty}
          title="Draft disimpan otomatis; tombol ini untuk menyimpan sekarang."
          className={BAR_GHOST}
        >
          <Save aria-hidden className="size-3.5" strokeWidth={2.2} />
          <span className="hidden lg:inline">Simpan draft</span>
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
          className={BAR_PRIMARY}
        >
          {busy ? (
            <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2.4} />
          ) : (
            <Upload aria-hidden className="size-3.5" strokeWidth={2.4} />
          )}
          Publish
        </button>
      </div>
    </header>
  );
}

function IconButton({
  icon: Icon,
  label,
  pressed,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={cn(
        "grid size-9 cursor-pointer place-items-center rounded-xl border border-ink-border text-ink-muted outline-none transition-colors hover:border-ink-muted/40 hover:text-ink-foreground focus-visible:ring-3 focus-visible:ring-brand-glow/40 disabled:cursor-not-allowed disabled:opacity-30",
        pressed && "border-brand-glow/40 bg-brand-glow/10 text-brand-glow",
      )}
    >
      <Icon aria-hidden className="size-4" strokeWidth={2.2} />
    </button>
  );
}

function MenuItem({
  icon: Icon,
  children,
  danger,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(MENU_ITEM, danger && "hover:bg-rose-500/10 hover:text-rose-300")}
    >
      <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.2} />
      <span className="min-w-0">{children}</span>
    </button>
  );
}

/**
 * Popover yang menutup saat klik di luar atau Escape.
 *
 * Ditulis di sini alih-alih memakai pustaka: satu-satunya perilaku yang
 * dibutuhkan halaman ini adalah "buka, tutup kalau ditinggal", dan itu tiga
 * baris. `pointerdown` dipilih daripada `click` supaya menekan tombol lain
 * langsung menutup panel ini sebelum tombol itu memproses kliknya.
 */
function Popover({
  label,
  srLabel,
  width,
  triggerClass,
  hideChevron,
  children,
}: {
  label: React.ReactNode;
  srLabel?: string;
  width: string;
  triggerClass?: string;
  hideChevron?: boolean;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={cn(BAR_GHOST, open && "border-ink-muted/40 text-ink-foreground", triggerClass)}
      >
        {srLabel && <span className="sr-only">{srLabel}</span>}
        {label}
        {!hideChevron && (
          <ChevronDown
            aria-hidden
            className={cn("size-3 transition-transform duration-200", open && "rotate-180")}
            strokeWidth={2.6}
          />
        )}
      </button>

      {open && (
        <div
          id={panelId}
          className={cn(
            "absolute right-0 top-full z-40 mt-2 max-h-[24rem] overflow-y-auto rounded-2xl border border-ink-border bg-ink-soft p-2.5 shadow-2xl shadow-black/40",
            width,
          )}
        >
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}
