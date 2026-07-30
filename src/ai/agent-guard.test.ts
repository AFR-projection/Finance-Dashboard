import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  executeToolsParallel: vi.fn(),
  loadHistory: vi.fn(),
  appendHistory: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("./tool-executor", () => ({ executeToolsParallel: mocks.executeToolsParallel }));
vi.mock("./conversation-store", () => ({
  loadHistory: mocks.loadHistory,
  appendHistory: mocks.appendHistory,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    aiMemory: { findMany: vi.fn().mockResolvedValue([]) },
    userSettings: { findUnique: vi.fn().mockResolvedValue(null) },
    transaction: { findMany: vi.fn().mockResolvedValue([]) },
    financialGoal: { count: vi.fn().mockResolvedValue(0) },
    aiInsight: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { runFinanceAgent } from "./agent";
import { UNGROUNDED_FIGURE_TEXT, UNVERIFIED_WRITE_CLAIM_TEXT } from "./intent-policy";

const CONFIG = { provider: "OPENROUTER" as const, model: "test/model", apiKey: "key" };

/** Queues raw model replies so a lying model can be simulated end to end. */
function queueModelReplies(...replies: Array<Record<string, unknown>>) {
  for (const message of replies) {
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message }] }),
    });
  }
  // A model that keeps repeating itself is exactly what the guards must survive,
  // so the last reply persists instead of the queue running dry once the agent's
  // round limit changes.
  const last = replies[replies.length - 1];
  mocks.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: last }] }),
  });
}

describe("runFinanceAgent transport guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.loadHistory.mockResolvedValue([]);
    mocks.appendHistory.mockResolvedValue(undefined);
  });

  it("refuses a saved-claim the model made without ever calling a tool", async () => {
    // The model answers a record request with pure prose and no tool call.
    queueModelReplies(
      { role: "assistant", content: "Oke", tool_calls: [] },
      { role: "assistant", content: "✅ Pengeluaran sudah tercatat." },
      { role: "assistant", content: "✅ Pengeluaran sudah tercatat." },
      { role: "assistant", content: "✅ Pengeluaran sudah tercatat." },
    );

    const reply = await runFinanceAgent({
      userId: "user-1",
      message: "tadi beli makan 100rb",
      config: CONFIG,
      channel: "WEB",
    });

    expect(reply.text).toBe(UNVERIFIED_WRITE_CLAIM_TEXT);
    expect(mocks.executeToolsParallel).not.toHaveBeenCalled();
  });

  it("refuses an invented balance when no read tool ran", async () => {
    queueModelReplies(
      { role: "assistant", content: "Saldo rekening Anda Rp100.000." },
      { role: "assistant", content: "Saldo rekening Anda Rp100.000." },
      { role: "assistant", content: "Saldo rekening Anda Rp100.000." },
      { role: "assistant", content: "Saldo rekening Anda Rp100.000." },
    );

    const reply = await runFinanceAgent({
      userId: "user-1",
      message: "cek keuangan saya",
      config: CONFIG,
      channel: "WEB",
    });

    expect(reply.text).toBe(UNGROUNDED_FIGURE_TEXT);
  });

  it("delivers a grounded balance answer that uses the phrase 'tercatat'", async () => {
    // A read-only turn. The prompt instructs the model to qualify figures with
    // "berdasarkan data yang tercatat", which must not trip the write guard.
    queueModelReplies(
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call-1", type: "function", function: { name: "getFinancialSnapshot", arguments: "{}" } },
        ],
      },
      {
        role: "assistant",
        content:
          "Saldo Mandiri Rp2.500.000. Total aset Rp3.100.000 berdasarkan data yang tercatat.",
      },
    );
    mocks.executeToolsParallel.mockResolvedValue([
      {
        name: "getFinancialSnapshot",
        result: {
          wallets: [
            { name: "Mandiri", currency: "IDR", balance: 2500000 },
            { name: "Cash", currency: "IDR", balance: 600000 },
          ],
          netCashflow: 400000,
        },
      },
    ]);

    const reply = await runFinanceAgent({
      userId: "user-1",
      message: "tolong check berapa saldo di bank mandiri gua dan total kan seluruh aset saya",
      config: CONFIG,
      channel: "TELEGRAM",
    });

    expect(reply.text).toContain("Rp2.500.000");
    expect(reply.text).not.toBe(UNVERIFIED_WRITE_CLAIM_TEXT);
  });

  it("answers a bare saldo question instead of returning a write error", async () => {
    queueModelReplies(
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call-1", type: "function", function: { name: "getFinancialSnapshot", arguments: "{}" } },
        ],
      },
      { role: "assistant", content: "Total saldo Anda Rp1.200.000 di 1 rekening." },
    );
    mocks.executeToolsParallel.mockResolvedValue([
      {
        name: "getFinancialSnapshot",
        result: { wallets: [{ name: "BCA", currency: "IDR", balance: 1200000 }], netCashflow: 0 },
      },
    ]);

    const reply = await runFinanceAgent({
      userId: "user-1",
      message: "berapa saldo gua ?",
      config: CONFIG,
      channel: "TELEGRAM",
    });

    expect(reply.text).toContain("Rp1.200.000");
    expect(mocks.executeToolsParallel).toHaveBeenCalled();
  });

  it("surfaces the account prompt instead of writing when several wallets match", async () => {
    queueModelReplies({
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call-1",
          type: "function",
          function: {
            name: "createTransaction",
            arguments: JSON.stringify({
              type: "EXPENSE",
              amount: 100000,
              category: "Food",
              description: "makan",
            }),
          },
        },
      ],
    });
    mocks.executeToolsParallel.mockResolvedValue([
      {
        name: "createTransaction",
        result: {
          __walletPrompt: {
            pendingId: "pending-1",
            question: "Pengeluaran makan — pilih rekening:",
            wallets: [
              { id: "bca", name: "BCA", currency: "IDR" },
              { id: "mandiri", name: "Mandiri", currency: "IDR" },
            ],
          },
          status: "AWAITING_WALLET_CHOICE",
          note: "",
        },
      },
    ]);

    const reply = await runFinanceAgent({
      userId: "user-1",
      message: "tadi beli makan 100rb",
      config: CONFIG,
      channel: "WEB",
    });

    expect(reply.walletPrompt?.wallets).toHaveLength(2);
    expect(reply.text).toContain("pilih rekening");
  });

  it("forces the account name into a confirmation that omitted it", async () => {
    // A mixed batch skips the receipt fast path, so the model's own prose is
    // what would otherwise reach the user.
    queueModelReplies(
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: {
              name: "createTransaction",
              arguments: JSON.stringify({
                type: "EXPENSE",
                amount: 100000,
                category: "Food",
                description: "makan",
              }),
            },
          },
          {
            id: "call-2",
            type: "function",
            function: { name: "getTransactions", arguments: "{}" },
          },
        ],
      },
      { role: "assistant", content: "✅ Pengeluaran tercatat, Rp100.000." },
    );
    mocks.executeToolsParallel.mockResolvedValue([
      {
        name: "createTransaction",
        result: {
          id: "tx-1",
          __verifiedMutation: {
            kind: "transaction.created",
            entityId: "tx-1",
            walletId: "bca",
            walletName: "BCA",
          },
          __clientMessage: "✅ Pengeluaran tercatat di BCA\nRp100.000 • Makanan\nmakan",
        },
      },
      { name: "getTransactions", result: { total: 0, items: [] } },
    ]);

    const reply = await runFinanceAgent({
      userId: "user-1",
      message: "tadi beli makan 100rb pakai BCA",
      config: CONFIG,
      channel: "WEB",
    });

    expect(reply.text).toContain("BCA");
  });
});
