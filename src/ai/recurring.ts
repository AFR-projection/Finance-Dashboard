/**
 * Recurring-charge detection and export windows for the agent tools.
 *
 * Kept out of tool-executor so the matching rules can be tested without a
 * database or an LLM in the loop.
 */

import { startOfMonth } from "@/lib/utils";

/** Strips noise so "Spotify 12/2025" and "SPOTIFY" collapse to one key. */
function normalizeDescription(text: string): string {
  return text
    .toLowerCase()
    .replace(/\d+/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 3)
    .join(" ")
    .trim();
}

type Tx = {
  description: string;
  amount: number;
  transactionDate: string | Date;
  category?: { name: string } | null;
  wallet?: { name: string; currency: string } | null;
};

export type RecurringCharge = {
  label: string;
  category: string;
  currency: string;
  occurrences: number;
  monthsSeen: number;
  averageAmount: number;
  lastSeen: string;
  daysSinceLastSeen: number;
  estimatedMonthlyCost: number;
  status: "active" | "possibly_cancelled" | "irregular";
};

/**
 * A charge counts as recurring when the same normalised description appears in
 * at least three distinct months with a stable amount.
 *
 * Three months rather than two: a purchase repeated once is a coincidence, and
 * flagging it as a subscription would train the user to ignore this list.
 */
export function detectRecurringCharges(transactions: Tx[], monthsAnalyzed: number) {
  const groups = new Map<string, { txs: Tx[]; months: Set<string> }>();

  for (const tx of transactions) {
    const key = normalizeDescription(tx.description);
    if (!key) continue;
    const date = new Date(tx.transactionDate);
    const group = groups.get(key) ?? { txs: [], months: new Set<string>() };
    group.txs.push(tx);
    group.months.add(date.toISOString().slice(0, 7));
    groups.set(key, group);
  }

  const now = Date.now();
  const charges: RecurringCharge[] = [];

  for (const [key, group] of groups) {
    if (group.months.size < 3) continue;

    const amounts = group.txs.map((t) => Number(t.amount));
    const average = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
    if (average <= 0) continue;

    // A subscription charges roughly the same every time. Wide spread means
    // this is an ordinary repeated purchase, not a fixed commitment.
    const spread = Math.max(...amounts) - Math.min(...amounts);
    const stable = spread <= average * 0.35;

    const lastDate = group.txs
      .map((t) => new Date(t.transactionDate).getTime())
      .reduce((latest, time) => Math.max(latest, time), 0);
    const daysSince = Math.floor((now - lastDate) / 86_400_000);

    charges.push({
      label: group.txs[group.txs.length - 1].description,
      category: group.txs[0].category?.name ?? "Lainnya",
      currency: group.txs[0].wallet?.currency ?? "IDR",
      occurrences: group.txs.length,
      monthsSeen: group.months.size,
      averageAmount: Math.round(average * 100) / 100,
      lastSeen: new Date(lastDate).toISOString().slice(0, 10),
      daysSinceLastSeen: daysSince,
      estimatedMonthlyCost: Math.round((average * group.txs.length) / group.months.size * 100) / 100,
      status: !stable ? "irregular" : daysSince > 45 ? "possibly_cancelled" : "active",
    });
    void key;
  }

  charges.sort((a, b) => b.estimatedMonthlyCost - a.estimatedMonthlyCost);

  const active = charges.filter((c) => c.status === "active");
  const byCurrency = new Map<string, number>();
  for (const charge of active) {
    byCurrency.set(
      charge.currency,
      (byCurrency.get(charge.currency) ?? 0) + charge.estimatedMonthlyCost,
    );
  }

  return {
    monthsAnalyzed,
    found: charges.length,
    charges,
    monthlyTotalByCurrency: [...byCurrency.entries()].map(([currency, total]) => ({
      currency,
      total: Math.round(total * 100) / 100,
    })),
    note:
      charges.length === 0
        ? "Belum ada pola langganan yang cukup jelas. Butuh minimal 3 bulan tagihan serupa."
        : "status=possibly_cancelled berarti tidak ada tagihan >45 hari — bisa jadi sudah berhenti atau terlupakan.",
  };
}

export type ExportRange = { from: Date; to: Date; label: string };

/** Named windows the agent can request, resolved in UTC to match stored dates. */
export function resolveExportRange(period: string, from?: string, to?: string): ExportRange {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const endOfToday = new Date(Date.UTC(y, m, now.getUTCDate(), 23, 59, 59, 999));

  switch (period) {
    case "last_month": {
      const start = new Date(Date.UTC(y, m - 1, 1));
      const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
      return { from: start, to: end, label: start.toISOString().slice(0, 7) };
    }
    case "last_30_days":
      return {
        from: new Date(Date.UTC(y, m, now.getUTCDate() - 30)),
        to: endOfToday,
        label: "30-hari-terakhir",
      };
    case "last_90_days":
      return {
        from: new Date(Date.UTC(y, m, now.getUTCDate() - 90)),
        to: endOfToday,
        label: "90-hari-terakhir",
      };
    case "this_year":
      return { from: new Date(Date.UTC(y, 0, 1)), to: endOfToday, label: String(y) };
    case "custom": {
      // Falls back to this month when either bound is missing or unparseable,
      // so a malformed date never produces an empty or absurd range.
      const start = from ? new Date(`${from}T00:00:00Z`) : null;
      const end = to ? new Date(`${to}T23:59:59Z`) : null;
      if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        return { from: start, to: end, label: `${from}_sd_${to}` };
      }
      break;
    }
  }

  return {
    from: startOfMonth(),
    to: endOfToday,
    label: `${y}-${String(m + 1).padStart(2, "0")}`,
  };
}
