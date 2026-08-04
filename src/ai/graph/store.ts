/**
 * Menjembatani graph yang tersimpan dengan runtime.
 *
 * Dua sikap yang disengaja di sini:
 *
 * 1. Graph rusak TIDAK PERNAH dipakai. Kalau baris di database gagal divalidasi,
 *    runtime kembali ke DEFAULT_GRAPH dan menulis error. Menjalankan separuh
 *    pipeline pada jalur yang mencatat uang jauh lebih berbahaya daripada
 *    menjalankan pipeline lama yang utuh.
 * 2. Hasil kompilasi di-cache pendek. Runtime memanggilnya tiap pesan masuk;
 *    tanpa cache, tiap chat menambah satu round-trip ke Neon hanya untuk membaca
 *    config yang nyaris tidak pernah berubah.
 */

import { prisma } from "@/lib/db";
import { compileGraph, type ChatPlan, type CompiledGraph, type HeartbeatPlan } from "./compile";
import { DEFAULT_GRAPH } from "./default-graph";
import type { AgentEdge, AgentGraphData, AgentNode } from "./types";

/**
 * Worker Telegram dan worker heartbeat adalah proses terpisah dengan cache-nya
 * masing-masing, jadi publish tidak bisa membatalkan cache mereka lewat memori.
 * TTL ini yang membatasi seberapa lama mereka boleh tertinggal.
 */
const CACHE_TTL_MS = 30_000;

let cache: { compiled: CompiledGraph; at: number } | null = null;

/** Dipanggil sesudah publish di proses yang sama supaya efeknya terasa seketika. */
export function invalidateGraphCache(): void {
  cache = null;
}

function toGraphData(nodes: unknown, edges: unknown): AgentGraphData | null {
  if (!Array.isArray(nodes) || !Array.isArray(edges) || nodes.length === 0) return null;
  return { nodes: nodes as AgentNode[], edges: edges as AgentEdge[] };
}

const DEFAULT_COMPILED = compileGraph(DEFAULT_GRAPH);

export type AgentGraphRecord = {
  version: number;
  published: AgentGraphData;
  /** Null berarti tidak ada perubahan tertunda. */
  draft: AgentGraphData | null;
  publishedAt: Date | null;
  updatedBy: string | null;
};

/** Bentuk mentah untuk panel admin: draft dan yang dipublish sekaligus. */
export async function readGraphRecord(): Promise<AgentGraphRecord> {
  const row = await prisma.agentGraph.findUnique({ where: { id: "singleton" } });

  if (!row || row.version === 0) {
    return {
      version: row?.version ?? 0,
      published: DEFAULT_GRAPH,
      draft: row ? toGraphData(row.draftNodes, row.draftEdges) : null,
      publishedAt: row?.publishedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  }

  return {
    version: row.version,
    published: toGraphData(row.nodes, row.edges) ?? DEFAULT_GRAPH,
    draft: toGraphData(row.draftNodes, row.draftEdges),
    publishedAt: row.publishedAt,
    updatedBy: row.updatedBy,
  };
}

export async function loadCompiledGraph(): Promise<CompiledGraph> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.compiled;

  let compiled = DEFAULT_COMPILED;
  try {
    const row = await prisma.agentGraph.findUnique({
      where: { id: "singleton" },
      select: { version: true, nodes: true, edges: true },
    });
    const data = row && row.version > 0 ? toGraphData(row.nodes, row.edges) : null;

    if (data) {
      const fromDatabase = compileGraph(data);
      if (fromDatabase.issues.some((issue) => issue.level === "error")) {
        console.error(
          "[agent-graph] Graph tersimpan tidak valid — memakai graph bawaan.",
          fromDatabase.issues.filter((i) => i.level === "error").map((i) => i.message),
        );
      } else {
        compiled = fromDatabase;
      }
    }
  } catch (err) {
    // Database tidak terjangkau tidak boleh membuat agent berhenti menjawab.
    console.error("[agent-graph] Gagal memuat graph, memakai graph bawaan:", err);
  }

  cache = { compiled, at: Date.now() };
  return compiled;
}

export async function loadChatPlan(): Promise<ChatPlan> {
  const compiled = await loadCompiledGraph();
  return compiled.chat ?? DEFAULT_COMPILED.chat!;
}

export async function loadHeartbeatPlan(): Promise<HeartbeatPlan> {
  const compiled = await loadCompiledGraph();
  return compiled.heartbeat ?? DEFAULT_COMPILED.heartbeat!;
}
