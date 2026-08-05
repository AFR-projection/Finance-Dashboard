/**
 * Token visual dan tipe bersama untuk Agent Studio.
 *
 * Katalog node dikirim dari server sebagai data biasa, jadi klien tidak pernah
 * mengimpor `@/ai/graph/catalogue` (yang menarik seluruh registry tool ke dalam
 * bundle browser). Konsekuensinya nama ikon datang sebagai string, dan peta di
 * bawah ini yang menerjemahkannya jadi komponen.
 */

import {
  Activity,
  AlarmClock,
  BellRing,
  BrainCircuit,
  Boxes,
  Crosshair,
  Database,
  History,
  MessageSquare,
  Send,
  ShieldCheck,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { AgentEdge, AgentGraphData, AgentNode, AgentNodeKind, ConfigField, NodeDefinition } from "@/ai/graph/types";
import type { GraphIssue } from "@/ai/graph/compile";
import type { AgentTelemetryEvent } from "@/lib/agent-telemetry";

export type {
  AgentEdge,
  AgentGraphData,
  AgentNode,
  AgentNodeKind,
  NodeDefinition,
  GraphIssue,
  AgentTelemetryEvent,
};

/** Alias lokal — nama `ConfigField` bentrok dengan komponen `Field` di inspector. */
export type ConfigFieldOf = ConfigField;

const ICONS: Record<string, LucideIcon> = {
  MessageSquare,
  Database,
  History,
  Crosshair,
  BrainCircuit,
  Wrench,
  ShieldCheck,
  Send,
  AlarmClock,
  Activity,
  Sparkles,
  BellRing,
};

/** Ikon yang tidak dikenal jatuh ke kotak generik, bukan crash saat render. */
export function iconFor(name: string): LucideIcon {
  return ICONS[name] ?? Boxes;
}

/**
 * Aksen per kategori node.
 *
 * Warna tidak pernah jadi satu-satunya pembeda: tiap kartu juga membawa ikon
 * dan label kategorinya, supaya kanvas tetap terbaca tanpa persepsi warna.
 */
export const ACCENTS = {
  trigger: { text: "text-sky-300", bg: "bg-sky-400/12", border: "border-sky-400/35", label: "Pemicu", swatch: "oklch(0.79 0.12 235)" },
  context: { text: "text-violet-300", bg: "bg-violet-400/12", border: "border-violet-400/35", label: "Konteks", swatch: "oklch(0.78 0.13 295)" },
  reason: { text: "text-brand-glow", bg: "bg-brand-glow/12", border: "border-brand-glow/35", label: "Penalaran", swatch: "oklch(0.78 0.12 175)" },
  act: { text: "text-amber-300", bg: "bg-amber-400/12", border: "border-amber-400/35", label: "Aksi", swatch: "oklch(0.85 0.13 85)" },
  guard: { text: "text-rose-300", bg: "bg-rose-400/12", border: "border-rose-400/35", label: "Penjaga", swatch: "oklch(0.78 0.13 15)" },
  output: { text: "text-emerald-300", bg: "bg-emerald-400/12", border: "border-emerald-400/35", label: "Keluaran", swatch: "oklch(0.83 0.13 155)" },
} as const;

export type AccentName = keyof typeof ACCENTS;

/**
 * Warna garis dan panah antar node.
 *
 * Ditulis literal, bukan `var(--ink-border)`: marker SVG diwarnai lewat atribut
 * `fill` yang tidak ikut mewarisi custom property dari elemen pemanggilnya, jadi
 * token di situ akan diam-diam jatuh ke hitam. Nilainya sengaja satu tingkat
 * lebih terang dari border panel supaya arah aliran tetap terbaca di atas dot grid.
 */
export const EDGE_COLOR = "oklch(0.44 0.03 185)";

export type NodeRunState = {
  status: "running" | "ok" | "skipped" | "error";
  ms?: number;
  detail?: string;
};

/**
 * `ring` mewarnai cincin kartu di kanvas, `dot` dipakai titik jejak dan batang
 * waterfall, `text` label statusnya. Ketiganya sengaja satu objek: warna status
 * yang sama harus berarti hal yang sama di kanvas maupun di konsol, dan dua peta
 * terpisah akan menyimpang pada perubahan pertama yang hanya menyentuh satu sisi.
 */
export const RUN_TONES: Record<
  NodeRunState["status"],
  { ring: string; dot: string; text: string; label: string }
> = {
  running: { ring: "ring-amber-300/70", dot: "bg-amber-300", text: "text-amber-200", label: "berjalan" },
  ok: { ring: "ring-brand-glow/70", dot: "bg-brand-glow", text: "text-brand-glow", label: "selesai" },
  skipped: { ring: "ring-ink-muted/40", dot: "bg-ink-muted/60", text: "text-ink-muted", label: "dilewati" },
  error: { ring: "ring-rose-400/70", dot: "bg-rose-400", text: "text-rose-300", label: "gagal" },
};

export type GraphRevision = {
  version: number;
  note: string | null;
  actorUserId: string | null;
  createdAt: string;
};

export type HeartbeatRunRow = {
  id: string;
  cadence: string;
  status: string;
  reason: string | null;
  /** Pesan asli di balik `reason`, mis. balasan mentah model yang gagal diparse. */
  detail: string | null;
  attempts: number;
  startedAt: string;
  durationMs: number | null;
};

/**
 * Yang dibutuhkan kanvas — dan hanya itu.
 *
 * Riwayat revisi sengaja tidak di sini meski route API mengirimkannya: kanvas
 * tidak lagi menampilkan riwayat, dan field yang ada di tipe tapi tidak dipakai
 * akan mengundang halaman berikutnya memuatnya "karena sudah ada".
 */
export type StudioPayload = {
  version: number;
  published: AgentGraphData;
  draft: AgentGraphData | null;
  publishedAt: string | null;
  updatedBy: string | null;
  catalogue: NodeDefinition[];
  defaultGraph: AgentGraphData;
  issues: GraphIssue[];
};

/** Perbandingan struktural yang mengabaikan urutan kunci config. */
export function sameGraph(a: AgentGraphData, b: AgentGraphData): boolean {
  return JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));
}

function normalise(graph: AgentGraphData) {
  return {
    nodes: [...graph.nodes]
      .sort((x, y) => x.id.localeCompare(y.id))
      .map((node) => ({
        id: node.id,
        kind: node.kind,
        label: node.label ?? "",
        enabled: node.enabled,
        // Posisi dibulatkan: menggeser node satu pixel karena scroll bukan
        // "perubahan yang belum dipublish".
        position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
        config: Object.fromEntries(Object.entries(node.config).sort(([p], [q]) => p.localeCompare(q))),
      })),
    edges: [...graph.edges]
      .map((edge) => `${edge.source}->${edge.target}`)
      .sort(),
  };
}

export function formatMs(ms?: number) {
  if (ms === undefined) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} dtk`;
}
