import { describe, expect, it } from "vitest";
import { agentTools } from "../tools";
import { compileGraph, validateGraph } from "./compile";
import { buildDefaultGraph, DEFAULT_CHAT_NODE_IDS } from "./default-graph";
import type { AgentGraphData } from "./types";

describe("graph bawaan", () => {
  it("lolos validasi tanpa error maupun peringatan", () => {
    expect(validateGraph(buildDefaultGraph())).toEqual([]);
  });

  // Inti jaring pengamannya: angka-angka ini dulu di-hardcode di runtime. Kalau
  // salah satu bergeser, graph bawaan diam-diam mengubah perilaku agent pada
  // instalasi yang tidak pernah menyentuh kanvas sama sekali.
  it("mereproduksi konstanta runtime lama persis", () => {
    const { chat, heartbeat } = compileGraph(buildDefaultGraph());

    expect(chat).not.toBeNull();
    expect(chat!.llm).toEqual({
      modelOverride: "",
      temperature: 0.2, // agent.ts:353
      maxRounds: 6, // agent.ts:47  MAX_AGENT_ROUNDS
      useFallbackModels: true,
      // Tiga angka ini tidak punya asal-usul di runtime lama — di sana memang
      // tidak ada batas waktu sama sekali, dan itulah cacatnya: `fetch` Node
      // menunggu selamanya. Defaultnya dipilih longgar supaya jawaban panjang
      // yang sah tidak ikut terpotong.
      requestTimeoutMs: 60000,
      maxRetries: 2,
      totalBudgetMs: 180000,
    });
    expect(chat!.tools).toEqual({
      enabled: agentTools.map((t) => t.name),
      maxToolCalls: 30, // agent.ts:54  MAX_TOOL_CALLS
      dedupeIdenticalCalls: true,
    });
    expect(chat!.context).toEqual({
      wallets: true,
      budget: true,
      prediction: true,
      goals: true,
      insights: true,
      memories: true,
      recentTransactions: true,
      memoryLimit: 60, // agent.ts:121
      transactionLimit: 12, // agent.ts:123
      insightLimit: 3, // agent.ts:133
    });
    expect(chat!.conversation).toEqual({
      maxTurns: 10, // conversation-store.ts:4
      ttlHours: 6, // conversation-store.ts:5  TTL_SECONDS = 60*60*6
    });
    expect(chat!.guard).toEqual({ enforceWriteClaim: true, enforceGroundedFigures: true });
    expect(chat!.intent).toEqual({ forceReadTool: true });
    expect(chat!.channels).toEqual(["WEB", "TELEGRAM"]);

    expect(heartbeat).not.toBeNull();
    expect(heartbeat!.schedule.defaultHour).toBe(7); // schema.prisma heartbeatHour default
    expect(heartbeat!.analyst.temperature).toBe(0.4); // analyst.ts:137
  });

  it("mengaktifkan seluruh 26 tool secara bawaan", () => {
    const { chat } = compileGraph(buildDefaultGraph());
    expect(chat!.tools!.enabled).toHaveLength(26);
  });
});

describe("mematikan node benar-benar menghapus tahapnya", () => {
  function withoutNode(id: string): AgentGraphData {
    const graph = buildDefaultGraph();
    return {
      nodes: graph.nodes.map((n) => (n.id === id ? { ...n, enabled: false } : n)),
      edges: graph.edges,
    };
  }

  it("guard yang dimatikan menghasilkan rencana tanpa guard", () => {
    const { chat } = compileGraph(withoutNode(DEFAULT_CHAT_NODE_IDS.guard));
    expect(chat!.guard).toBeNull();
  });

  it("konteks yang dimatikan menghasilkan rencana tanpa konteks", () => {
    const { chat } = compileGraph(withoutNode(DEFAULT_CHAT_NODE_IDS.context));
    expect(chat!.context).toBeNull();
  });

  it("eksekutor tool yang dimatikan menghasilkan rencana tanpa tool", () => {
    const { chat } = compileGraph(withoutNode(DEFAULT_CHAT_NODE_IDS.tools));
    expect(chat!.tools).toBeNull();
  });
});

describe("validasi menolak susunan yang tidak masuk akal", () => {
  it("menolak guard yang diletakkan sebelum LLM", () => {
    const graph = buildDefaultGraph();
    const broken: AgentGraphData = {
      nodes: graph.nodes,
      edges: [
        ...graph.edges.filter((e) => e.id !== `${DEFAULT_CHAT_NODE_IDS.llm}->${DEFAULT_CHAT_NODE_IDS.guard}`),
        { id: "guard-before-llm", source: DEFAULT_CHAT_NODE_IDS.guard, target: DEFAULT_CHAT_NODE_IDS.llm },
      ],
    };

    const issues = validateGraph(broken);
    expect(issues.some((i) => i.level === "error" && i.message.includes("tahapnya terbalik"))).toBe(true);
  });

  it("menolak sambungan antar-jalur chat dan heartbeat", () => {
    const graph = buildDefaultGraph();
    const broken: AgentGraphData = {
      nodes: graph.nodes,
      edges: [...graph.edges, { id: "silang", source: DEFAULT_CHAT_NODE_IDS.llm, target: "hb-notify" }],
    };

    expect(
      validateGraph(broken).some((i) => i.message.includes("tidak boleh disambungkan")),
    ).toBe(true);
  });

  it("menolak node wajib yang dimatikan", () => {
    const graph = buildDefaultGraph();
    const broken: AgentGraphData = {
      nodes: graph.nodes.map((n) =>
        n.id === DEFAULT_CHAT_NODE_IDS.llm ? { ...n, enabled: false } : n,
      ),
      edges: graph.edges,
    };

    expect(validateGraph(broken).some((i) => i.message.includes("wajib aktif"))).toBe(true);
  });

  it("menolak node wajib yang dihapus", () => {
    const graph = buildDefaultGraph();
    const broken: AgentGraphData = {
      nodes: graph.nodes.filter((n) => n.id !== DEFAULT_CHAT_NODE_IDS.dispatch),
      edges: graph.edges.filter((e) => e.target !== DEFAULT_CHAT_NODE_IDS.dispatch),
    };

    expect(validateGraph(broken).some((i) => i.message.includes("wajib punya node"))).toBe(true);
  });

  it("menolak dua node singleton sejenis", () => {
    const graph = buildDefaultGraph();
    const duplicate = { ...graph.nodes.find((n) => n.id === DEFAULT_CHAT_NODE_IDS.llm)!, id: "llm-kedua" };
    const broken: AgentGraphData = { nodes: [...graph.nodes, duplicate], edges: graph.edges };

    expect(validateGraph(broken).some((i) => i.message.includes("Hanya boleh ada satu"))).toBe(true);
  });

  it("memperingatkan node yang menggantung tanpa sambungan", () => {
    const graph = buildDefaultGraph();
    const orphan: AgentGraphData = {
      nodes: graph.nodes,
      edges: graph.edges.filter(
        (e) =>
          e.source !== DEFAULT_CHAT_NODE_IDS.conversation &&
          e.target !== DEFAULT_CHAT_NODE_IDS.conversation,
      ),
    };

    const issues = validateGraph(orphan);
    expect(issues.some((i) => i.level === "warning" && i.message.includes("tidak tersambung"))).toBe(
      true,
    );
  });

  it("tidak mengompilasi graph yang punya error, supaya pemanggil jatuh ke bawaan", () => {
    const graph = buildDefaultGraph();
    const broken: AgentGraphData = {
      nodes: graph.nodes.filter((n) => n.id !== DEFAULT_CHAT_NODE_IDS.llm),
      edges: graph.edges,
    };

    const compiled = compileGraph(broken);
    expect(compiled.chat).toBeNull();
    expect(compiled.issues.some((i) => i.level === "error")).toBe(true);
  });

  // Lingkaran LLM ⇄ tool adalah satu-satunya edge mundur yang sah: model
  // memanggil tool, hasilnya masuk lagi ke model.
  it("mengizinkan edge balik dari eksekutor tool ke LLM", () => {
    const issues = validateGraph(buildDefaultGraph());
    expect(issues).toEqual([]);
  });
});
