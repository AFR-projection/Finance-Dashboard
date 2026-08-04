/**
 * Pipeline bawaan — cerminan perilaku runtime sebelum kanvas ada.
 *
 * Dipakai kapan pun belum ada graph yang dipublish, jadi memasang fitur ini
 * pada instalasi yang sudah jalan tidak mengubah apa pun sampai admin benar-
 * benar menekan Publish. Test di default-graph.test.ts membandingkan nilainya
 * dengan konstanta di katalog supaya keduanya tidak bisa diam-diam berpisah.
 */

import { definitionFor } from "./catalogue";
import { defaultConfigFor, type AgentGraphData, type AgentNode, type AgentNodeKind } from "./types";

/** Kolom kiri-ke-kanan; kanvas memakai grid 260×150 supaya kabelnya rapi. */
const COLUMN = 300;
const ROW = 170;

function node(id: string, kind: AgentNodeKind, col: number, row: number): AgentNode {
  return {
    id,
    kind,
    enabled: true,
    position: { x: col * COLUMN, y: row * ROW },
    config: defaultConfigFor(definitionFor(kind)),
  };
}

function edge(source: string, target: string) {
  return { id: `${source}->${target}`, source, target };
}

export const DEFAULT_CHAT_NODE_IDS = {
  trigger: "chat-trigger",
  conversation: "chat-memory",
  context: "chat-context",
  intent: "chat-intent",
  llm: "chat-llm",
  tools: "chat-tools",
  guard: "chat-guard",
  dispatch: "chat-reply",
} as const;

export const DEFAULT_HEARTBEAT_NODE_IDS = {
  trigger: "hb-schedule",
  signals: "hb-signals",
  analyst: "hb-analyst",
  dispatch: "hb-notify",
} as const;

export function buildDefaultGraph(): AgentGraphData {
  const c = DEFAULT_CHAT_NODE_IDS;
  const h = DEFAULT_HEARTBEAT_NODE_IDS;

  const nodes: AgentNode[] = [
    // Jalur chat, baris atas.
    node(c.trigger, "trigger.chat", 0, 0),
    node(c.conversation, "memory.conversation", 1, 0),
    node(c.context, "context.loader", 2, 0),
    node(c.intent, "policy.intent", 3, 0),
    node(c.llm, "llm.reasoner", 4, 0),
    // Eksekutor tool duduk di bawah LLM: keduanya satu lingkaran, bukan rantai lurus.
    node(c.tools, "tools.executor", 4, 1),
    node(c.guard, "guard.grounding", 5, 0),
    node(c.dispatch, "dispatch.reply", 6, 0),

    // Jalur heartbeat, baris bawah.
    node(h.trigger, "trigger.schedule", 0, 3),
    node(h.signals, "signals.collect", 1, 3),
    node(h.analyst, "llm.analyst", 2, 3),
    node(h.dispatch, "dispatch.notify", 3, 3),
  ];

  const edges = [
    edge(c.trigger, c.conversation),
    edge(c.conversation, c.context),
    edge(c.context, c.intent),
    edge(c.intent, c.llm),
    edge(c.llm, c.tools),
    edge(c.tools, c.llm),
    edge(c.llm, c.guard),
    edge(c.guard, c.dispatch),

    edge(h.trigger, h.signals),
    edge(h.signals, h.analyst),
    edge(h.analyst, h.dispatch),
  ];

  return { nodes, edges };
}

export const DEFAULT_GRAPH: AgentGraphData = buildDefaultGraph();
