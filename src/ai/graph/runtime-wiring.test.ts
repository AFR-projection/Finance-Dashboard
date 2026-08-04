/**
 * Bukti bahwa kanvas benar-benar menggerakkan runtime.
 *
 * Test karakterisasi di agent-characterization.test.ts membuktikan graph bawaan
 * TIDAK mengubah apa pun. File ini membuktikan sisi sebaliknya: mengubah node
 * benar-benar mengubah apa yang dikirim ke provider dan apa yang sampai ke user.
 * Tanpa keduanya, "drag-drop yang berfungsi" cuma klaim.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  executeToolsParallel: vi.fn(),
  loadHistory: vi.fn(),
  appendHistory: vi.fn(),
  recordAiUsage: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("../tool-executor", () => ({ executeToolsParallel: mocks.executeToolsParallel }));
vi.mock("../conversation-store", () => ({
  loadHistory: mocks.loadHistory,
  appendHistory: mocks.appendHistory,
  DEFAULT_CONVERSATION_LIMITS: { maxTurns: 10, ttlHours: 6 },
}));
vi.mock("../usage", () => ({ recordAiUsage: mocks.recordAiUsage }));
vi.mock("@/lib/db", () => ({
  prisma: {
    aiMemory: { findMany: vi.fn().mockResolvedValue([]) },
    userSettings: { findUnique: vi.fn().mockResolvedValue(null) },
    transaction: { findMany: vi.fn().mockResolvedValue([]) },
    financialGoal: { count: vi.fn().mockResolvedValue(0) },
    aiInsight: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { runFinanceAgent } from "../agent";
import { UNVERIFIED_WRITE_CLAIM_TEXT } from "../intent-policy";
import { compileGraph } from "./compile";
import { buildDefaultGraph } from "./default-graph";
import type { ChatPlan } from "./compile";

const CONFIG = { provider: "OPENROUTER" as const, model: "test/model", apiKey: "key" };

function planWith(patch: (plan: ChatPlan) => ChatPlan): ChatPlan {
  const base = compileGraph(buildDefaultGraph()).chat!;
  return patch(structuredClone(base));
}

function queueReply(message: Record<string, unknown>) {
  mocks.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message }] }),
  });
}

function bodyOf(index = 0) {
  return JSON.parse((mocks.fetch.mock.calls[index][1] as { body: string }).body);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.loadHistory.mockResolvedValue([]);
  mocks.appendHistory.mockResolvedValue(undefined);
  mocks.executeToolsParallel.mockResolvedValue([]);
});

describe("node guard", () => {
  const lie = { role: "assistant", content: "✅ Pengeluaran sudah tercatat." };

  it("menyaring klaim palsu saat guard menyala", async () => {
    queueReply(lie);

    const reply = await runFinanceAgent({
      userId: "u1",
      message: "tadi beli makan 100rb",
      config: CONFIG,
      channel: "WEB",
      plan: planWith((p) => p),
    });

    expect(reply.text).toBe(UNVERIFIED_WRITE_CLAIM_TEXT);
  });

  // Inti buktinya: satu toggle di kanvas, dan saringan itu benar-benar lepas.
  it("meloloskan klaim yang sama saat guard dimatikan", async () => {
    queueReply(lie);

    const reply = await runFinanceAgent({
      userId: "u1",
      message: "tadi beli makan 100rb",
      config: CONFIG,
      channel: "WEB",
      plan: planWith((p) => ({ ...p, guard: null })),
    });

    expect(reply.text).toBe("✅ Pengeluaran sudah tercatat.");
  });

  it("bisa mematikan hanya satu saringan tanpa yang lain", async () => {
    queueReply(lie);

    const reply = await runFinanceAgent({
      userId: "u1",
      message: "tadi beli makan 100rb",
      config: CONFIG,
      channel: "WEB",
      plan: planWith((p) => ({
        ...p,
        guard: { enforceWriteClaim: false, enforceGroundedFigures: true },
      })),
    });

    expect(reply.text).toBe("✅ Pengeluaran sudah tercatat.");
  });
});

describe("node eksekutor tool", () => {
  it("hanya mengirim tool yang dicentang ke provider", async () => {
    queueReply({ role: "assistant", content: "Halo." });

    await runFinanceAgent({
      userId: "u1",
      message: "halo",
      config: CONFIG,
      channel: "WEB",
      plan: planWith((p) => ({
        ...p,
        tools: { ...p.tools!, enabled: ["getFinancialSnapshot", "getTransactions"] },
      })),
    });

    // Urutannya mengikuti daftar di tools.ts, bukan urutan pencentangan.
    const names = bodyOf().tools.map((t: { function: { name: string } }) => t.function.name);
    expect(names).toEqual(["getTransactions", "getFinancialSnapshot"]);
    expect(names).not.toContain("createTransaction");
  });

  it("menghilangkan kunci tools sama sekali saat node eksekutor dimatikan", async () => {
    queueReply({ role: "assistant", content: "Halo." });

    await runFinanceAgent({
      userId: "u1",
      message: "halo",
      config: CONFIG,
      channel: "WEB",
      plan: planWith((p) => ({ ...p, tools: null })),
    });

    const body = bodyOf();
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });

  it("menolak tool yang dimatikan meski model tetap memanggilnya", async () => {
    queueReply({
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "c1",
          type: "function",
          function: { name: "createTransaction", arguments: "{}" },
        },
      ],
    });

    await runFinanceAgent({
      userId: "u1",
      message: "catat 10rb",
      config: CONFIG,
      channel: "WEB",
      plan: planWith((p) => ({
        ...p,
        tools: { ...p.tools!, enabled: ["getFinancialSnapshot"] },
      })),
    });

    expect(mocks.executeToolsParallel).toHaveBeenCalledWith("u1", [], "WEB");
  });
});

describe("node penalaran LLM", () => {
  it("memakai temperature dan model dari config node", async () => {
    queueReply({ role: "assistant", content: "Halo." });

    await runFinanceAgent({
      userId: "u1",
      message: "halo",
      config: CONFIG,
      channel: "WEB",
      plan: planWith((p) => ({
        ...p,
        llm: { ...p.llm, temperature: 1.1, modelOverride: "khusus/model" },
      })),
    });

    expect(bodyOf().temperature).toBe(1.1);
    expect(bodyOf().model).toBe("khusus/model");
  });

  it("tidak mencoba model cadangan saat opsinya dimatikan", async () => {
    mocks.fetch.mockRejectedValue(new Error("mati"));

    await runFinanceAgent({
      userId: "u1",
      message: "halo",
      config: { ...CONFIG, fallbackModels: ["cadangan/satu"] },
      channel: "WEB",
      plan: planWith((p) => ({ ...p, llm: { ...p.llm, useFallbackModels: false } })),
    });

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("node pemicu", () => {
  it("menolak kanal yang tidak dilayani sebelum membelanjakan token", async () => {
    const reply = await runFinanceAgent({
      userId: "u1",
      message: "halo",
      config: CONFIG,
      channel: "TELEGRAM",
      plan: planWith((p) => ({ ...p, channels: ["WEB"] })),
    });

    expect(reply.text).toContain("tidak melayani kanal ini");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe("node riwayat percakapan", () => {
  it("tidak memuat maupun menyimpan riwayat saat node dimatikan", async () => {
    queueReply({ role: "assistant", content: "Halo." });

    await runFinanceAgent({
      userId: "u1",
      message: "halo",
      config: CONFIG,
      channel: "WEB",
      plan: planWith((p) => ({ ...p, conversation: null })),
    });

    expect(mocks.loadHistory).not.toHaveBeenCalled();
    expect(mocks.appendHistory).not.toHaveBeenCalled();
  });
});
