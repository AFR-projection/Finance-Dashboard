import { describe, expect, it } from "vitest";
import {
  parseWalletCallback,
  resolveWalletReply,
  walletCallbackData,
  walletKeyboard,
} from "./wallet-choice";

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

const WALLETS = [
  { id: "w1", name: "BCA", currency: "IDR" },
  { id: "w2", name: "Mandiri", currency: "IDR" },
  { id: "w3", name: "ABA", currency: "USD" },
];

describe("resolveWalletReply", () => {
  it("matches the button order the keyboard renders", () => {
    const keyboard = walletKeyboard({
      pendingId: PENDING,
      question: "Pengeluaran makan — pilih rekening:",
      wallets: WALLETS,
    });

    expect(keyboard.inline_keyboard[1][0].text).toBe("Mandiri (IDR)");
    expect(resolveWalletReply("2", WALLETS)).toEqual({ walletId: "w2" });
  });

  it("matches by list position", () => {
    expect(resolveWalletReply("1", WALLETS)).toEqual({ walletId: "w1" });
    expect(resolveWalletReply("3.", WALLETS)).toEqual({ walletId: "w3" });
  });

  it("matches by name regardless of case", () => {
    expect(resolveWalletReply("mandiri", WALLETS)).toEqual({ walletId: "w2" });
    expect(resolveWalletReply("  ABA  ", WALLETS)).toEqual({ walletId: "w3" });
  });

  it("matches an unambiguous prefix", () => {
    expect(resolveWalletReply("mand", WALLETS)).toEqual({ walletId: "w2" });
  });

  it("treats 0 and the word batal as a cancellation", () => {
    expect(resolveWalletReply("0", WALLETS)).toEqual({ walletId: null });
    expect(resolveWalletReply("batal", WALLETS)).toEqual({ walletId: null });
  });

  it("refuses an out-of-range number rather than wrapping around", () => {
    expect(resolveWalletReply("9", WALLETS)).toBeUndefined();
  });

  it("refuses a prefix that fits more than one account", () => {
    const ambiguous = [
      { id: "a", name: "BCA Utama" },
      { id: "b", name: "BCA Bisnis" },
    ];
    expect(resolveWalletReply("bca", ambiguous)).toBeUndefined();
  });

  it("lets an ordinary message fall through to the agent", () => {
    expect(resolveWalletReply("beli kopi 20rb", WALLETS)).toBeUndefined();
    expect(resolveWalletReply("", WALLETS)).toBeUndefined();
  });
});
