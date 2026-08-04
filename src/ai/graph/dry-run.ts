/**
 * Menjalankan draft graph tanpa kemungkinan menyentuh data user.
 *
 * Cara pengamanannya sengaja bukan flag `dryRun` yang diteruskan ke dalam
 * tool-executor. Flag semacam itu harus dihormati oleh setiap cabang di jalur
 * yang menulis uang, dan satu cabang yang lupa memeriksanya sudah cukup untuk
 * membuat tombol "Jalankan tes" mencatat transaksi sungguhan.
 *
 * Yang dilakukan di sini justru menghapus tool-nya dari rencana. Runtime tidak
 * pernah mengirim tool yang dimatikan ke model, DAN menolak tool yang tidak ada
 * di daftar aktif meski model mengarang namanya. Jadi mutasi bukan "dilarang" —
 * mutasi tidak punya jalan untuk terjadi.
 *
 * Daftarnya adalah allowlist, bukan denylist: tool baru yang ditambahkan nanti
 * otomatis terblokir sampai seseorang secara sadar menyatakannya aman.
 */

import type { ChatPlan } from "./compile";

export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "getCurrentTime",
  "getTransactions",
  "getFinancialSnapshot",
  "generateFinancialReport",
  "analyzeBudget",
  "financialCoach",
  "predictFinances",
  "analyzeCashflowTrend",
  "getMonthlySummary",
  "comparePeriods",
  "analyzeSpendingPattern",
  "detectAnomalies",
  "getSavingsSuggestions",
  "recallMemories",
  "simulateScenario",
  "planBudgetFromHistory",
  "detectRecurring",
  "projectBalance",
]);

export type DryRunPlan = { plan: ChatPlan; blockedTools: string[] };

/**
 * Rencana yang sama dengan draft, minus setiap tool yang bisa mengubah apa pun.
 *
 * Riwayat percakapan juga dimatikan: uji coba admin tidak boleh menyelinap ke
 * dalam konteks obrolan user yang sedang berjalan.
 */
export function toDryRunPlan(plan: ChatPlan): DryRunPlan {
  const requested = plan.tools?.enabled ?? [];
  const allowed = requested.filter((name) => READ_ONLY_TOOLS.has(name));
  const blockedTools = requested.filter((name) => !READ_ONLY_TOOLS.has(name));

  return {
    blockedTools,
    plan: {
      ...plan,
      conversation: null,
      tools: plan.tools ? { ...plan.tools, enabled: allowed } : null,
    },
  };
}
