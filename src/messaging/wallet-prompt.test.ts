import { describe, expect, it } from "vitest";
import {
  parseWalletCallback,
  walletCallbackData,
  walletKeyboard,
} from "./wallet-prompt";

const PENDING = "clx1pending000000000000000";
const WALLET = "clx1wallet0000000000000000";

describe("wallet callback data", () => {
  it("round-trips a wallet choice", () => {
    expect(parseWalletCallback(walletCallbackData(PENDING, WALLET))).toEqual({
      pendingId: PENDING,
      walletId: WALLET,
    });
  });

  it("round-trips a cancellation", () => {
    expect(parseWalletCallback(walletCallbackData(PENDING, null))).toEqual({
      pendingId: PENDING,
      walletId: null,
    });
  });

  it("stays within Telegram's 64-byte callback_data limit", () => {
    expect(Buffer.byteLength(walletCallbackData(PENDING, WALLET))).toBeLessThanOrEqual(64);
  });

  it("rejects data from another feature", () => {
    expect(parseWalletCallback("access:approve:a1b2c3")).toBeNull();
    expect(parseWalletCallback("wallet:only-one-part")).toBeNull();
  });
});

describe("walletKeyboard", () => {
  it("gives every wallet its own button plus a cancel row", () => {
    const keyboard = walletKeyboard({
      pendingId: PENDING,
      question: "pilih rekening",
      wallets: [
        { id: "w1", name: "BCA", currency: "IDR" },
        { id: "w2", name: "ABA", currency: "USD" },
      ],
    });

    expect(keyboard.inline_keyboard).toHaveLength(3);
    expect(keyboard.inline_keyboard[0][0].text).toBe("BCA (IDR)");
    expect(keyboard.inline_keyboard[1][0].text).toBe("ABA (USD)");
    expect(parseWalletCallback(keyboard.inline_keyboard[1][0].callback_data)).toEqual({
      pendingId: PENDING,
      walletId: "w2",
    });
    expect(parseWalletCallback(keyboard.inline_keyboard[2][0].callback_data)?.walletId).toBeNull();
  });
});
