import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTransaction: vi.fn(),
  createPendingTransaction: vi.fn(),
  listActiveWalletChoices: vi.fn(),
}));

vi.mock("@/finance-engine", () => ({
  FinanceEngine: { createTransaction: mocks.createTransaction },
}));

vi.mock("@/messaging/pending-transaction", () => ({
  createPendingTransaction: mocks.createPendingTransaction,
}));

vi.mock("@/messaging/wallet-prompt", () => ({
  WALLET_PROMPT_MARKER: "__walletPrompt",
  listActiveWalletChoices: mocks.listActiveWalletChoices,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    userSettings: { findUnique: vi.fn().mockResolvedValue({ timezone: "Asia/Jakarta" }) },
  },
}));

import { executeTool } from "./tool-executor";

const wallets = [
  { id: "bca", name: "BCA", currency: "IDR", isDefault: true },
  { id: "mandiri", name: "Mandiri", currency: "IDR", isDefault: false },
];

describe("createTransaction wallet guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listActiveWalletChoices.mockResolvedValue(wallets);
    mocks.createPendingTransaction.mockResolvedValue({ id: "pending-1" });
    mocks.createTransaction.mockResolvedValue({
      id: "transaction-1",
      type: "EXPENSE",
      amount: 100_000,
      description: "makan",
      category: { name: "Food" },
      wallet: { id: "mandiri", name: "Mandiri", currency: "IDR" },
    });
  });

  it("holds a WEB transaction when the model guessed a wallet the user never named", async () => {
    const result = await executeTool(
      "user-1",
      "createTransaction",
      {
        type: "EXPENSE",
        amount: 100_000,
        category: "Food",
        description: "makan",
        walletId: "bca",
        rawInput: "tadi beli makan 100rb",
      },
      "WEB",
    );

    expect(result).toMatchObject({ status: "AWAITING_WALLET_CHOICE" });
    expect(mocks.createPendingTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", channel: "WEB", amount: 100_000 }),
    );
    expect(mocks.createTransaction).not.toHaveBeenCalled();
  });

  it("uses the account named by the user even if the model proposed another id", async () => {
    await executeTool(
      "user-1",
      "createTransaction",
      {
        type: "EXPENSE",
        amount: 100_000,
        category: "Food",
        description: "makan",
        walletId: "bca",
        rawInput: "tadi beli makan 100rb pakai Mandiri",
      },
      "WEB",
    );

    expect(mocks.createPendingTransaction).not.toHaveBeenCalled();
    expect(mocks.createTransaction).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ walletId: "mandiri", amount: 100_000 }),
    );
  });
});
