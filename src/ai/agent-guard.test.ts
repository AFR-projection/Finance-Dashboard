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
