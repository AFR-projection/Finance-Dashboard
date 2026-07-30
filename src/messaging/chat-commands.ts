/**
 * Slash commands the chat channels answer. Telegram registers them through
 * grammY; the web agent resolves the same words here so both surfaces stay in
 * step.
 */

export type ChatCommand =
  | { kind: "agent"; prompt: string }
  | { kind: "text"; text: string };

export const HELP_TEXT = [
  "*Ledgerly AI Finance Agent*",
  "",
  "*Contoh pesan biasa:*",
  "• beli makan 35 ribu",
  "• gaji masuk 7 juta",
  "• cek pengeluaran bulan ini",
  "• buatkan rekening BCA saldo awal 500 ribu",
  "• budget makanan 500 ribu",
  "• target nabung 5 juta",
  "",
  "*Perintah:*",
  "/report — Laporan 30 hari",
  "/balance — Ringkasan bulan ini",
  "/expense — Analisis pengeluaran",
  "/wallets — Daftar rekening & saldo",
  "/budget — Status budget bulan ini",
  "/goals — Progres target nabung",
  "/help — Bantuan ini",
].join("\n");

const AGENT_COMMANDS: Record<string, { prompt: string; description: string }> = {
  report: { prompt: "Buatkan laporan keuangan 30 hari terakhir", description: "Laporan 30 hari" },
  balance: {
    prompt: "Berapa ringkasan saldo, income, dan expense bulan ini?",
    description: "Ringkasan bulan ini",
  },
  expense: {
    prompt: "Analisis pengeluaran saya bulan ini dan kategori terbesar",
    description: "Analisis pengeluaran",
  },
  wallets: {
    prompt: "Tampilkan semua rekening saya beserta saldo per mata uang",
    description: "Daftar rekening & saldo",
  },
  budget: {
    prompt: "Bagaimana status budget saya bulan ini? Mana yang sudah lewat batas?",
    description: "Status budget",
  },
  goals: {
    prompt: "Bagaimana progres target nabung saya?",
    description: "Progres target nabung",
  },
};

/** Feeds Telegram's command menu. */
export const AGENT_COMMAND_LIST = Object.entries(AGENT_COMMANDS).map(([command, spec]) => ({
  command,
  prompt: spec.prompt,
  description: spec.description,
}));

/**
 * The leading slash is required. A bare "bca" or "budget" could equally be an
 * answer to a pending wallet question or an ordinary message, and the agent
 * already understands those in plain language.
 */
export function resolveChatCommand(value: string): ChatCommand | null {
  const match = value.trim().toLowerCase().match(/^\/([a-z]+)$/);
  if (!match) return null;
  const word = match[1];

  if (word === "help" || word === "menu" || word === "bantuan") {
    return { kind: "text", text: HELP_TEXT };
  }

  const spec = AGENT_COMMANDS[word];
  return spec ? { kind: "agent", prompt: spec.prompt } : null;
}
