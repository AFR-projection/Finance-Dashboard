import type { WalletChoice } from "./wallet-choice";

export type ActiveWalletChoice = WalletChoice & { isDefault: boolean };

export type WalletResolution =
  | { status: "NO_WALLET" }
  | { status: "SELECTED"; wallet: ActiveWalletChoice; reason: "ONLY_WALLET" | "EXPLICIT_NAME" | "EXPLICIT_DEFAULT" | "EXPLICIT_CURRENCY" }
  | { status: "NEEDS_CHOICE"; wallets: ActiveWalletChoice[] };

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("id-ID")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function containsPhrase(text: string, phrase: string): boolean {
  return phrase.length > 0 && ` ${text} `.includes(` ${phrase} `);
}

function uniqueWallet(wallets: ActiveWalletChoice[]): ActiveWalletChoice | undefined {
  return wallets.length === 1 ? wallets[0] : undefined;
}

function mentionsAccountTerm(text: string, term: string): boolean {
  const accountWords = "(?:rekening|rek|akun|account|wallet|dompet|kartu)";
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    new RegExp(`(?:^| )${accountWords}(?: [a-z0-9]+){0,2} ${escaped}(?: |$)`).test(text) ||
    new RegExp(`(?:^| )${escaped}(?: [a-z0-9]+){0,2} ${accountWords}(?: |$)`).test(text)
  );
}

const CURRENCY_TERMS: Record<string, string[]> = {
  IDR: ["idr", "rupiah"],
  USD: ["usd", "dollar", "dolar"],
  SGD: ["sgd", "dollar singapura", "dolar singapura"],
  EUR: ["eur", "euro"],
  GBP: ["gbp", "pound", "sterling"],
  JPY: ["jpy", "yen"],
};

/**
 * Resolves an account from the user's own words. A walletId proposed by the
 * model is deliberately not accepted as evidence: with multiple accounts, the
 * tool must be able to prove the user named one or it pauses for confirmation.
 */
export function resolveTransactionWallet(
  wallets: ActiveWalletChoice[],
  rawInput: unknown,
): WalletResolution {
  if (wallets.length === 0) return { status: "NO_WALLET" };
  if (wallets.length === 1) {
    return { status: "SELECTED", wallet: wallets[0], reason: "ONLY_WALLET" };
  }

  const text = normalize(typeof rawInput === "string" ? rawInput : "");
  if (!text) return { status: "NEEDS_CHOICE", wallets };

  const byName = uniqueWallet(
    wallets.filter((wallet) => containsPhrase(text, normalize(wallet.name))),
  );
  if (byName) return { status: "SELECTED", wallet: byName, reason: "EXPLICIT_NAME" };

  // Account labels are often saved as "BCA Utama" but referred to as "BCA".
  // Accept the leading label only when it identifies exactly one wallet.
  const byUniqueLeadingName = uniqueWallet(
    wallets.filter((wallet) => {
      const leadingName = normalize(wallet.name).split(" ")[0];
      return leadingName.length >= 2 && containsPhrase(text, leadingName);
    }),
  );
  if (byUniqueLeadingName) {
    return { status: "SELECTED", wallet: byUniqueLeadingName, reason: "EXPLICIT_NAME" };
  }

  const asksForDefault = [
    "rekening utama",
    "akun utama",
    "wallet utama",
    "dompet utama",
    "rekening default",
    "akun default",
    "default account",
  ].some((term) => containsPhrase(text, term));
  if (asksForDefault) {
    const byDefault = uniqueWallet(wallets.filter((wallet) => wallet.isDefault));
    if (byDefault) {
      return { status: "SELECTED", wallet: byDefault, reason: "EXPLICIT_DEFAULT" };
    }
  }

  const mentionedCurrencies = Object.entries(CURRENCY_TERMS)
    .filter(([, terms]) => terms.some((term) => mentionsAccountTerm(text, term)))
    .map(([currency]) => currency);
  if (mentionedCurrencies.length === 1) {
    const byCurrency = uniqueWallet(
      wallets.filter((wallet) => wallet.currency.toUpperCase() === mentionedCurrencies[0]),
    );
    if (byCurrency) {
      return { status: "SELECTED", wallet: byCurrency, reason: "EXPLICIT_CURRENCY" };
    }
  }

  return { status: "NEEDS_CHOICE", wallets };
}
