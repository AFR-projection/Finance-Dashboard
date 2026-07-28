import { describe, expect, it } from "vitest";
import { resolveTransactionWallet, type ActiveWalletChoice } from "./wallet-resolution";

const WALLETS: ActiveWalletChoice[] = [
  { id: "bca", name: "BCA Utama", currency: "IDR", isDefault: true },
  { id: "mandiri", name: "Mandiri", currency: "IDR", isDefault: false },
  { id: "usd", name: "Jenius Dollar", currency: "USD", isDefault: false },
];

describe("resolveTransactionWallet", () => {
  it("requires a choice when several wallets exist and none was named", () => {
    expect(resolveTransactionWallet(WALLETS, "tadi beli makan 100rb")).toEqual({
      status: "NEEDS_CHOICE",
      wallets: WALLETS,
    });
  });

  it("does not treat a model-proposed wallet id as user confirmation", () => {
    const result = resolveTransactionWallet(WALLETS, "beli kopi 25 ribu");
    expect(result.status).toBe("NEEDS_CHOICE");
  });

  it("selects a wallet explicitly named by the user", () => {
    const result = resolveTransactionWallet(WALLETS, "bayar makan 100rb pakai Mandiri");
    expect(result).toMatchObject({ status: "SELECTED", wallet: { id: "mandiri" }, reason: "EXPLICIT_NAME" });
  });

  it("accepts an unambiguous leading account label", () => {
    const result = resolveTransactionWallet(WALLETS, "bayar tagihan pakai BCA");
    expect(result).toMatchObject({ status: "SELECTED", wallet: { id: "bca" } });
  });

  it("resolves an explicit request for the default account", () => {
    const result = resolveTransactionWallet(WALLETS, "ambil dari rekening utama");
    expect(result).toMatchObject({ status: "SELECTED", wallet: { id: "bca" }, reason: "EXPLICIT_DEFAULT" });
  });

  it("resolves a currency only when it names an account and is unambiguous", () => {
    expect(resolveTransactionWallet(WALLETS, "catat di rekening dollar")).toMatchObject({
      status: "SELECTED",
      wallet: { id: "usd" },
      reason: "EXPLICIT_CURRENCY",
    });
    expect(resolveTransactionWallet(WALLETS, "beli barang 100 dollar").status).toBe("NEEDS_CHOICE");
  });

  it("automatically uses the only active wallet", () => {
    expect(resolveTransactionWallet([WALLETS[1]], "beli makan 100rb")).toMatchObject({
      status: "SELECTED",
      wallet: { id: "mandiri" },
      reason: "ONLY_WALLET",
    });
  });

  it("reports that no account exists", () => {
    expect(resolveTransactionWallet([], "beli makan 100rb")).toEqual({ status: "NO_WALLET" });
  });
});
