/**
 * Mengubah graph gambar jadi rencana eksekusi, dan menolak yang tidak masuk akal.
 *
 * Validasi di sini bukan formalitas: graph ini menggerakkan jalur yang menulis
 * transaksi uang sungguhan. Lebih baik menolak susunan yang salah dengan pesan
 * jelas di kanvas daripada menerimanya lalu berperilaku aneh saat produksi.
 */

import { definitionFor, NODE_DEFINITIONS } from "./catalogue";
import type { AgentGraphData, AgentNode, AgentNodeKind, AgentTrack } from "./types";

export type GraphIssue = {
  level: "error" | "warning";
  nodeId?: string;
  message: string;
};

/**
 * Urutan tahap. Sebuah edge boleh maju atau tetap, tapi tidak boleh mundur —
 * guard yang diletakkan sebelum LLM tidak punya apa pun untuk diperiksa, dan
 * konteks yang dimuat sesudah LLM tidak pernah sampai ke prompt.
 *
 * Node dengan peringkat sama boleh ditukar bebas (mis. riwayat vs konteks).
 */
const PHASE_RANK: Record<AgentNodeKind, number> = {
  "trigger.chat": 0,
  "memory.conversation": 1,
  "context.loader": 1,
  "policy.intent": 2,
  "llm.reasoner": 3,
  "tools.executor": 4,
  "guard.grounding": 5,
  "dispatch.reply": 6,

  "trigger.schedule": 0,
  "signals.collect": 1,
  "llm.analyst": 2,
  "dispatch.notify": 3,
};

export type ChatPlan = {
  nodeIds: Partial<Record<AgentNodeKind, string>>;
  channels: string[];
  conversation: { maxTurns: number; ttlHours: number } | null;
  context: {
    wallets: boolean;
    budget: boolean;
    prediction: boolean;
    goals: boolean;
    insights: boolean;
    memories: boolean;
    recentTransactions: boolean;
    memoryLimit: number;
    transactionLimit: number;
    insightLimit: number;
  } | null;
  intent: { forceReadTool: boolean } | null;
  llm: {
    modelOverride: string;
    temperature: number;
    maxRounds: number;
    useFallbackModels: boolean;
  };
  tools: { enabled: string[]; maxToolCalls: number; dedupeIdenticalCalls: boolean } | null;
  guard: { enforceWriteClaim: boolean; enforceGroundedFigures: boolean } | null;
};

export type HeartbeatPlan = {
  nodeIds: Partial<Record<AgentNodeKind, string>>;
  schedule: { defaultHour: number; daily: boolean; weekly: boolean; monthly: boolean };
  analyst: { modelOverride: string; temperature: number };
  dispatch: { telegram: boolean; webPush: boolean; monthlyAttachment: boolean };
};

export type CompiledGraph = {
  chat: ChatPlan | null;
  heartbeat: HeartbeatPlan | null;
  issues: GraphIssue[];
};

// ─── Pembaca config yang tahan graph lama ────────────────────────────────────
//
// Graph yang disimpan sebelum sebuah field ditambahkan tidak punya kuncinya.
// Semua pembaca jatuh ke default katalog alih-alih menghasilkan undefined yang
// merembet jadi NaN di tengah runtime.

function fieldDefault(kind: AgentNodeKind, key: string): unknown {
  return definitionFor(kind).fields.find((f) => f.key === key)?.default;
}

function readNumber(node: AgentNode, key: string): number {
  const raw = node.config?.[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  return Number(fieldDefault(node.kind, key) ?? 0);
}

function readBoolean(node: AgentNode, key: string): boolean {
  const raw = node.config?.[key];
  if (typeof raw === "boolean") return raw;
  return Boolean(fieldDefault(node.kind, key));
}

function readText(node: AgentNode, key: string): string {
  const raw = node.config?.[key];
  if (typeof raw === "string") return raw.trim();
  return String(fieldDefault(node.kind, key) ?? "");
}

function readList(node: AgentNode, key: string): string[] {
  const raw = node.config?.[key];
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === "string");
  const fallback = fieldDefault(node.kind, key);
  return Array.isArray(fallback) ? [...(fallback as string[])] : [];
}

// ─── Validasi ────────────────────────────────────────────────────────────────

function trackOf(kind: AgentNodeKind): AgentTrack {
  return NODE_DEFINITIONS[kind].track;
}

export function validateGraph(data: AgentGraphData): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const seenIds = new Set<string>();
  const byId = new Map<string, AgentNode>();

  for (const node of data.nodes) {
    if (!NODE_DEFINITIONS[node.kind]) {
      issues.push({ level: "error", nodeId: node.id, message: `Tipe node tidak dikenal: ${node.kind}` });
      continue;
    }
    if (seenIds.has(node.id)) {
      issues.push({ level: "error", nodeId: node.id, message: `ID node ganda: ${node.id}` });
      continue;
    }
    seenIds.add(node.id);
    byId.set(node.id, node);
  }

  for (const edge of data.edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) {
      issues.push({ level: "error", message: `Koneksi menunjuk node yang tidak ada (${edge.source} → ${edge.target})` });
      continue;
    }
    if (trackOf(source.kind) !== trackOf(target.kind)) {
      issues.push({
        level: "error",
        nodeId: source.id,
        message: `Jalur chat dan heartbeat tidak boleh disambungkan (${definitionFor(source.kind).label} → ${definitionFor(target.kind).label})`,
      });
      continue;
    }
    // Satu-satunya edge mundur yang sah: eksekutor tool kembali ke LLM. Keduanya
    // memang satu lingkaran — model memanggil tool, hasilnya masuk lagi ke model.
    const isToolLoop = source.kind === "tools.executor" && target.kind === "llm.reasoner";
    if (!isToolLoop && PHASE_RANK[source.kind] > PHASE_RANK[target.kind]) {
      issues.push({
        level: "error",
        nodeId: source.id,
        message: `${definitionFor(source.kind).label} tidak boleh berada sesudah ${definitionFor(target.kind).label} — tahapnya terbalik.`,
      });
    }
    if (!definitionFor(source.kind).hasOutput) {
      issues.push({
        level: "error",
        nodeId: source.id,
        message: `${definitionFor(source.kind).label} adalah akhir jalur dan tidak boleh punya koneksi keluar.`,
      });
    }
  }

  for (const track of ["chat", "heartbeat"] as const) {
    const nodes = data.nodes.filter((n) => byId.has(n.id) && trackOf(n.kind) === track);
    if (nodes.length === 0) continue;

    const counts = new Map<AgentNodeKind, number>();
    for (const node of nodes) counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);

    for (const [kind, count] of counts) {
      if (count > 1 && definitionFor(kind).singleton) {
        issues.push({
          level: "error",
          message: `Hanya boleh ada satu ${definitionFor(kind).label} di jalur ${track}.`,
        });
      }
    }

    for (const definition of Object.values(NODE_DEFINITIONS)) {
      if (definition.track !== track || !definition.required) continue;
      const present = nodes.find((n) => n.kind === definition.kind);
      if (!present) {
        issues.push({
          level: "error",
          message: `Jalur ${track} wajib punya node ${definition.label}.`,
        });
      } else if (!present.enabled) {
        issues.push({
          level: "error",
          nodeId: present.id,
          message: `${definition.label} wajib aktif — jalur ${track} tidak berarti tanpanya.`,
        });
      }
    }

    // Node yang tidak tersambung ke apa pun hampir selalu sisa tarikan yang
    // terlupakan. Bukan error, tapi harus terlihat: config-nya tidak berpengaruh.
    for (const node of nodes) {
      const connected = data.edges.some((e) => e.source === node.id || e.target === node.id);
      if (!connected) {
        issues.push({
          level: "warning",
          nodeId: node.id,
          message: `${definitionFor(node.kind).label} tidak tersambung ke apa pun — config-nya tidak akan dipakai.`,
        });
      }
    }
  }

  return issues;
}

// ─── Kompilasi ───────────────────────────────────────────────────────────────

/** Node yang dipakai runtime: ada di graph DAN dinyalakan. */
function activeNode(data: AgentGraphData, kind: AgentNodeKind): AgentNode | null {
  return data.nodes.find((n) => n.kind === kind && n.enabled) ?? null;
}

function anyNode(data: AgentGraphData, kind: AgentNodeKind): AgentNode | null {
  return data.nodes.find((n) => n.kind === kind) ?? null;
}

function collectIds(data: AgentGraphData, kinds: AgentNodeKind[]) {
  const ids: Partial<Record<AgentNodeKind, string>> = {};
  for (const kind of kinds) {
    const node = anyNode(data, kind);
    if (node) ids[kind] = node.id;
  }
  return ids;
}

function compileChat(data: AgentGraphData): ChatPlan | null {
  const trigger = activeNode(data, "trigger.chat");
  const llm = activeNode(data, "llm.reasoner");
  if (!trigger || !llm) return null;

  const conversation = activeNode(data, "memory.conversation");
  const context = activeNode(data, "context.loader");
  const intent = activeNode(data, "policy.intent");
  const tools = activeNode(data, "tools.executor");
  const guard = activeNode(data, "guard.grounding");

  return {
    nodeIds: collectIds(data, [
      "trigger.chat",
      "memory.conversation",
      "context.loader",
      "policy.intent",
      "llm.reasoner",
      "tools.executor",
      "guard.grounding",
      "dispatch.reply",
    ]),
    channels: readList(trigger, "channels"),
    conversation: conversation
      ? {
          maxTurns: readNumber(conversation, "maxTurns"),
          ttlHours: readNumber(conversation, "ttlHours"),
        }
      : null,
    context: context
      ? {
          wallets: readBoolean(context, "wallets"),
          budget: readBoolean(context, "budget"),
          prediction: readBoolean(context, "prediction"),
          goals: readBoolean(context, "goals"),
          insights: readBoolean(context, "insights"),
          memories: readBoolean(context, "memories"),
          recentTransactions: readBoolean(context, "recentTransactions"),
          memoryLimit: readNumber(context, "memoryLimit"),
          transactionLimit: readNumber(context, "transactionLimit"),
          insightLimit: readNumber(context, "insightLimit"),
        }
      : null,
    intent: intent ? { forceReadTool: readBoolean(intent, "forceReadTool") } : null,
    llm: {
      modelOverride: readText(llm, "modelOverride"),
      temperature: readNumber(llm, "temperature"),
      maxRounds: readNumber(llm, "maxRounds"),
      useFallbackModels: readBoolean(llm, "useFallbackModels"),
    },
    tools: tools
      ? {
          enabled: readList(tools, "enabledTools"),
          maxToolCalls: readNumber(tools, "maxToolCalls"),
          dedupeIdenticalCalls: readBoolean(tools, "dedupeIdenticalCalls"),
        }
      : null,
    guard: guard
      ? {
          enforceWriteClaim: readBoolean(guard, "enforceWriteClaim"),
          enforceGroundedFigures: readBoolean(guard, "enforceGroundedFigures"),
        }
      : null,
  };
}

function compileHeartbeat(data: AgentGraphData): HeartbeatPlan | null {
  const trigger = activeNode(data, "trigger.schedule");
  const analyst = activeNode(data, "llm.analyst");
  const dispatch = activeNode(data, "dispatch.notify");
  if (!trigger || !analyst || !dispatch) return null;

  return {
    nodeIds: collectIds(data, [
      "trigger.schedule",
      "signals.collect",
      "llm.analyst",
      "dispatch.notify",
    ]),
    schedule: {
      defaultHour: readNumber(trigger, "defaultHour"),
      daily: readBoolean(trigger, "daily"),
      weekly: readBoolean(trigger, "weekly"),
      monthly: readBoolean(trigger, "monthly"),
    },
    analyst: {
      modelOverride: readText(analyst, "modelOverride"),
      temperature: readNumber(analyst, "temperature"),
    },
    dispatch: {
      telegram: readBoolean(dispatch, "telegram"),
      webPush: readBoolean(dispatch, "webPush"),
      monthlyAttachment: readBoolean(dispatch, "monthlyAttachment"),
    },
  };
}

export function compileGraph(data: AgentGraphData): CompiledGraph {
  const issues = validateGraph(data);
  const fatal = issues.some((i) => i.level === "error");

  // Graph rusak tidak pernah dikompilasi. Pemanggilnya jatuh ke DEFAULT_GRAPH,
  // karena menjalankan separuh pipeline lebih berbahaya daripada menjalankan
  // pipeline lama yang utuh.
  if (fatal) return { chat: null, heartbeat: null, issues };

  return { chat: compileChat(data), heartbeat: compileHeartbeat(data), issues };
}
