export type DeterministicAgentIntent = "CREATE_TRANSACTION" | "FINANCIAL_SNAPSHOT" | null;

const MONEY_PATTERN =
  /(?:rp\s*)?\d[\d.,]*(?:\s*(?:rb|ribu|jt|juta|k|m|idr|usd|sgd|eur|dolar|dollar)|\s*\$)/i;
const HYPOTHETICAL_PATTERN = /\b(?:kalau|jika|misal|misalnya|contoh|rencana|nanti|akan|mau)\b/i;
const EXPLICIT_RECORD_PATTERN = /\b(?:catat|catatkan|input|masukkan|rekam)\b/i;
const NON_TRANSACTION_RECORD_PATTERN = /\b(?:budget|anggaran|target|goal|rekening|wallet|akun)\b/i;
const COMPLETED_TRANSACTION_PATTERN =
  /\b(?:pengeluaran|pemasukan|beli|belanja|bayar|makan|minum|isi bensin|transfer(?:an)?|terima|menerima|dapat|dapet|gajian|gaji|keluar)\b/i;
const COMPLETION_CONTEXT_PATTERN = /\b(?:tadi|barusan|kemarin|hari ini|sudah|udah|habis|baru saja)\b/i;
const SNAPSHOT_PATTERN =
  /(?:\b(?:cek|check|scan|scanning|lihat|tampilkan|berapa|gimana|bagaimana|ringkas)\b.{0,50}\b(?:keuangan|saldo|rekening|wallet|akun|aset)\b)|(?:\b(?:saldo|aset)\b.{0,40}\b(?:rekening|wallet|akun|saya|aku|gue|gua)\b)|(?:\bkondisi keuangan\b)/i;

/**
 * Only classifies intents that are safe to enforce at the transport layer.
 * The LLM still extracts fields, but it cannot skip the required finance tool.
 */
export function classifyDeterministicIntent(message: string): DeterministicAgentIntent {
  const text = message.trim();
  if (!text) return null;

  if (SNAPSHOT_PATTERN.test(text)) return "FINANCIAL_SNAPSHOT";

  const hasMoney = MONEY_PATTERN.test(text);
  if (!hasMoney) return null;

  const explicitlyRecords =
    EXPLICIT_RECORD_PATTERN.test(text) && !NON_TRANSACTION_RECORD_PATTERN.test(text);
  if (explicitlyRecords) return "CREATE_TRANSACTION";

  if (HYPOTHETICAL_PATTERN.test(text)) return null;

  if (
    COMPLETED_TRANSACTION_PATTERN.test(text) &&
    (COMPLETION_CONTEXT_PATTERN.test(text) || /^(?:pengeluaran|pemasukan|beli|bayar|belanja)\b/i.test(text))
  ) {
    return "CREATE_TRANSACTION";
  }

  return null;
}

export function claimsTransactionWasSaved(text: string): boolean {
  return /\b(?:(?:sudah|telah|berhasil)\s+)?(?:tercatat|dicatat|tersimpan|disimpan)\b/i.test(text);
}

export function requiredToolForIntent(intent: DeterministicAgentIntent):
  | "createTransaction"
  | "getFinancialSnapshot"
  | undefined {
  if (intent === "CREATE_TRANSACTION") return "createTransaction";
  if (intent === "FINANCIAL_SNAPSHOT") return "getFinancialSnapshot";
  return undefined;
}

export const UNVERIFIED_WRITE_CLAIM_TEXT =
  "Transaksi belum tercatat. Sistem tidak mengembalikan bukti penyimpanan, jadi saya tidak bisa menyatakannya berhasil. Silakan kirim ulang transaksinya beserta rekening yang dipakai.";

export const UNGROUNDED_FIGURE_TEXT =
  "Saya belum bisa menyebut angka keuangan Anda karena data resminya belum terbaca. Silakan coba lagi sebentar lagi — saya tidak akan menebak nominal.";

/**
 * The model's prose is never evidence of a write. A reply may only claim a
 * transaction was saved when a tool returned a read-after-write receipt during
 * the same turn; otherwise the claim is replaced instead of trusted.
 */
export function enforceWriteClaim(params: { text: string; hasVerifiedWrite: boolean }): string {
  if (params.hasVerifiedWrite) return params.text;
  if (!claimsTransactionWasSaved(params.text)) return params.text;
  return UNVERIFIED_WRITE_CLAIM_TEXT;
}

/**
 * Detects a monetary figure in the agent's own reply. Wider than MONEY_PATTERN,
 * which parses user shorthand: a reply states amounts as "Rp100.000" or
 * "USD 20", with no "ribu"/"juta" suffix to key on.
 */
const REPLY_FIGURE_PATTERN =
  /(?:rp|idr|usd|sgd|eur|gbp|jpy|\$)\s*\d|\d[\d.,]*\s*(?:rb|ribu|jt|juta|idr|usd|dolar|dollar)\b/i;

/**
 * Blocks fabricated balances. When the turn asked for figures but no read tool
 * actually ran, any monetary amount in the reply came from the model, not the
 * ledger — so the reply is refused rather than shown as fact.
 */
export function enforceGroundedFigures(params: {
  text: string;
  intent: DeterministicAgentIntent;
  ranRequiredRead: boolean;
}): string {
  if (params.intent !== "FINANCIAL_SNAPSHOT" || params.ranRequiredRead) return params.text;
  return REPLY_FIGURE_PATTERN.test(params.text) ? UNGROUNDED_FIGURE_TEXT : params.text;
}
