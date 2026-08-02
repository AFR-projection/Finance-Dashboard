import { describe, expect, it } from "vitest";
import { isWalletPromptResult, WALLET_PROMPT_MARKER } from "./wallet-prompt";
import type { WalletPrompt } from "./wallet-choice";

/**
 * Reproduces the batch-dictation bug: three expenses in one message produced
 * three pending drafts, but only the first ever reached the user as buttons.
 * The other two sat in the database with no way to confirm them.
 */
function collectPrompts(toolResults: unknown[]): WalletPrompt[] {
  const prompts: WalletPrompt[] = [];
  for (const result of toolResults) {
    if (isWalletPromptResult(result)) prompts.push(result[WALLET_PROMPT_MARKER]);
  }
  return prompts;
}

function pendingResult(pendingId: string, description: string) {
  return {
    [WALLET_PROMPT_MARKER]: {
      pendingId,
      question: `Pengeluaran ${description} — pilih rekening:`,
      wallets: [
        { id: "w-aba", name: "ABA", currency: "USD" },
        { id: "w-mandiri", name: "MANDIRI", currency: "IDR" },
      ],
    },
    status: "AWAITING_WALLET_CHOICE" as const,
    note: "Transaksi belum dicatat.",
  };
}

describe("batch wallet prompts", () => {
  it("keeps one prompt per pending transaction", () => {
    const prompts = collectPrompts([
      pendingResult("p1", "Bayar taxi"),
      pendingResult("p2", "Bayar makan"),
      pendingResult("p3", "Beli rokok"),
    ]);

    expect(prompts).toHaveLength(3);
    expect(prompts.map((p) => p.pendingId)).toEqual(["p1", "p2", "p3"]);
  });

  it("gives every draft its own id so confirming one cannot settle another", () => {
    const prompts = collectPrompts([
      pendingResult("p1", "Bayar taxi"),
      pendingResult("p2", "Bayar makan"),
    ]);

    expect(new Set(prompts.map((p) => p.pendingId)).size).toBe(prompts.length);
  });

  it("ignores tool results that are not wallet prompts", () => {
    const prompts = collectPrompts([
      { status: "OK", transaction: { id: "t1" } },
      pendingResult("p1", "Beli rokok"),
      { error: "something failed" },
    ]);

    expect(prompts).toHaveLength(1);
    expect(prompts[0].pendingId).toBe("p1");
  });

  it("reports no prompts when every transaction resolved its account", () => {
    expect(collectPrompts([{ status: "OK" }, { status: "OK" }])).toHaveLength(0);
  });
});
