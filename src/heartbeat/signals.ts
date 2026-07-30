/**
 * Collects the raw financial situation for one user as structured signals.
 *
 * Pure data gathering, no LLM and no judgement: every signal carries the exact
 * figures behind it so the analyst never has to invent a number. Signals are
 * context for the model, not a gate — the user asked for an LLM pass on every
 * cycle.
 */

import { FinanceEngine } from "@/finance-engine";
import { prisma } from "@/lib/db";
import { daysAgo } from "@/lib/utils";

export type Severity = "info" | "good" | "warning" | "critical";

export type Signal = {
  kind:
    | "budget_risk"
    | "overspend_risk"
    | "category_spike"
    | "goal_pace"
    | "positive_momentum"
    | "silence";
  severity: Severity;
  summary: string;
  figures: Record<string, number | string>;
};

export type HeartbeatSnapshot = {
  currency: string;
  timezone: string;
  localDate: string;
  cadence: "daily" | "weekly";
  signals: Signal[];
  wallets: Array<{ name: string; currency: string; balance: number }>;
  monthToDate: {
    income: number;
    expense: number;
    savingRate: number;
    daysElapsed: number;
    daysInMonth: number;
    projectedExpense: number;
    projectedBalance: number;
  };
  budgets: Array<{ category: string; limit: number; spent: number; percentUsed: number; status: string }>;
  goals: Array<{ name: string; target: number; current: number; percent: number; deadline: string | null }>;
  topCategoriesThisMonth: Array<{ category: string; amount: number }>;
  lastWeek: { income: number; expense: number; transactionCount: number } | null;
  monthlyTrend: Array<{ label: string; income: number; expense: number }>;
  recentInsightTitles: string[];
};

function money(value: number): number {
  return Math.round(value);
}

export async function collectSnapshot(
  userId: string,
  cadence: "daily" | "weekly",
): Promise<HeartbeatSnapshot> {
  const [settings, wallets, budgetReport, prediction, cashflow, goals, recentInsights, lastTx] =
    await Promise.all([
      prisma.userSettings.findUnique({ where: { userId } }),
      FinanceEngine.listWallets(userId).catch(() => []),
      FinanceEngine.analyzeBudget(userId).catch(() => null),
      FinanceEngine.predictMonthEnd(userId),
      FinanceEngine.getCashflowSeries(userId, 4).catch(() => null),
      FinanceEngine.listGoals(userId).catch(() => []),
      FinanceEngine.listAiInsights(userId).catch(() => []),
      prisma.transaction.findFirst({
        where: { userId },
        orderBy: { transactionDate: "desc" },
        select: { transactionDate: true },
      }),
    ]);

  const currency = settings?.currency ?? "IDR";
  const timezone = settings?.timezone ?? "Asia/Jakarta";
  const localDate = new Date().toLocaleDateString("sv-SE", { timeZone: timezone });

  const monthTxs = await prisma.transaction.findMany({
    where: {
      userId,
      transactionDate: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
    },
    include: { category: true },
  });

  const categoryThisMonth: Record<string, number> = {};
  for (const tx of monthTxs) {
    if (tx.type !== "EXPENSE") continue;
    const name = tx.category?.name ?? "Lainnya";
    categoryThisMonth[name] = (categoryThisMonth[name] ?? 0) + Number(tx.amount);
  }

  // Three closed months of history, so the current partial month cannot drag the
  // baseline down and make every category look like a spike.
  const historyFrom = daysAgo(120);
  const historyTxs = await prisma.transaction.findMany({
    where: { userId, transactionDate: { gte: historyFrom } },
    include: { category: true },
  });
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const baselineTotals: Record<string, number> = {};
  const baselineMonths = new Set<string>();
  for (const tx of historyTxs) {
    if (tx.type !== "EXPENSE") continue;
    if (tx.transactionDate >= monthStart) continue;
    const name = tx.category?.name ?? "Lainnya";
    baselineTotals[name] = (baselineTotals[name] ?? 0) + Number(tx.amount);
    baselineMonths.add(tx.transactionDate.toISOString().slice(0, 7));
  }
  const baselineMonthCount = Math.max(1, baselineMonths.size);

  const signals: Signal[] = [];

  const pctOfMonthElapsed = Math.round((prediction.daysElapsed / prediction.daysInMonth) * 100);

  if (budgetReport) {
    for (const budget of budgetReport.budgets) {
      if (budget.status === "over") {
        signals.push({
          kind: "budget_risk",
          severity: "critical",
          summary: `Budget ${budget.categoryName} sudah terlampaui.`,
          figures: {
            kategori: budget.categoryName,
            terpakai: money(budget.spent),
            pagu: money(budget.limit),
            persenTerpakai: budget.percentUsed,
            persenBulanBerjalan: pctOfMonthElapsed,
          },
        });
      } else if (budget.percentUsed >= 80 && pctOfMonthElapsed <= 70) {
        signals.push({
          kind: "budget_risk",
          severity: "warning",
          summary: `Budget ${budget.categoryName} terpakai ${budget.percentUsed}% padahal bulan baru berjalan ${pctOfMonthElapsed}%.`,
          figures: {
            kategori: budget.categoryName,
            terpakai: money(budget.spent),
            pagu: money(budget.limit),
            sisa: money(budget.remaining),
            persenTerpakai: budget.percentUsed,
            persenBulanBerjalan: pctOfMonthElapsed,
          },
        });
      }
    }
  }

  if (prediction.riskOverspend && prediction.currentIncome > 0) {
    signals.push({
      kind: "overspend_risk",
      severity: "warning",
      summary: "Laju pengeluaran memproyeksikan bulan ini tutup minus.",
      figures: {
        pemasukanBulanIni: money(prediction.currentIncome),
        pengeluaranBulanIni: money(prediction.currentExpense),
        proyeksiPengeluaran: money(prediction.projectedExpense),
        proyeksiArusKas: money(prediction.projectedBalance),
        selisih: money(prediction.projectedExpense - prediction.currentIncome),
      },
    });
  }

  for (const [category, amount] of Object.entries(categoryThisMonth)) {
    const baselineMonthly = (baselineTotals[category] ?? 0) / baselineMonthCount;
    if (baselineMonthly < 50_000) continue;
    // Compare like with like: month-to-date against the same fraction of the
    // historical month, otherwise every category looks calm on day 3.
    const expectedByNow = (baselineMonthly * prediction.daysElapsed) / prediction.daysInMonth;
    if (expectedByNow <= 0) continue;
    const ratio = amount / expectedByNow;
    if (ratio >= 1.5) {
      signals.push({
        kind: "category_spike",
        severity: ratio >= 2 ? "warning" : "info",
        summary: `Pengeluaran ${category} bulan ini ${Math.round((ratio - 1) * 100)}% di atas pola biasanya.`,
        figures: {
          kategori: category,
          bulanIni: money(amount),
          normalSampaiHariIni: money(expectedByNow),
          rataRataBulanan: money(baselineMonthly),
        },
      });
    }
  }

  for (const goal of goals) {
    const target = Number(goal.targetAmount);
    const current = Number(goal.currentAmount);
    if (target <= 0 || current >= target) continue;
    if (!goal.deadline) continue;
    const monthsLeft = Math.max(
      0,
      (goal.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.44),
    );
    const needPerMonth = monthsLeft > 0 ? (target - current) / monthsLeft : target - current;
    const affordablePerMonth = prediction.currentIncome - prediction.projectedExpense;
    if (monthsLeft <= 0 || needPerMonth > Math.max(0, affordablePerMonth)) {
      signals.push({
        kind: "goal_pace",
        severity: monthsLeft <= 0 ? "critical" : "warning",
        summary:
          monthsLeft <= 0
            ? `Tenggat goal ${goal.goalName} sudah lewat dan targetnya belum tercapai.`
            : `Laju tabungan belum cukup untuk goal ${goal.goalName}.`,
        figures: {
          goal: goal.goalName,
          target: money(target),
          terkumpul: money(current),
          persen: Math.round((current / target) * 100),
          bulanTersisa: Math.round(monthsLeft * 10) / 10,
          butuhPerBulan: money(needPerMonth),
          sisaArusKasProyeksi: money(affordablePerMonth),
        },
      });
    }
  }

  const savingRate =
    prediction.currentIncome > 0
      ? Math.round(
          ((prediction.currentIncome - prediction.currentExpense) / prediction.currentIncome) * 1000,
        ) / 10
      : 0;

  if (savingRate >= 20 && !prediction.riskOverspend && prediction.currentIncome > 0) {
    signals.push({
      kind: "positive_momentum",
      severity: "good",
      summary: `Saving rate bulan ini ${savingRate}% dan proyeksinya masih aman.`,
      figures: {
        savingRate,
        pemasukanBulanIni: money(prediction.currentIncome),
        pengeluaranBulanIni: money(prediction.currentExpense),
        proyeksiArusKas: money(prediction.projectedBalance),
      },
    });
  }

  if (lastTx) {
    const silentDays = Math.floor((Date.now() - lastTx.transactionDate.getTime()) / 86_400_000);
    if (silentDays > 3) {
      signals.push({
        kind: "silence",
        severity: "info",
        summary: `Tidak ada transaksi tercatat selama ${silentDays} hari.`,
        figures: { hariTanpaCatatan: silentDays },
      });
    }
  }

  const lastWeek = await (async () => {
    if (cadence !== "weekly") return null;
    const from = daysAgo(7);
    const txs = await prisma.transaction.findMany({
      where: { userId, transactionDate: { gte: from } },
    });
    let income = 0;
    let expense = 0;
    for (const tx of txs) {
      if (tx.type === "INCOME") income += Number(tx.amount);
      else expense += Number(tx.amount);
    }
    return { income: money(income), expense: money(expense), transactionCount: txs.length };
  })();

  return {
    currency,
    timezone,
    localDate,
    cadence,
    signals,
    wallets: wallets.map((w) => ({ name: w.name, currency: w.currency, balance: money(w.balance) })),
    monthToDate: {
      income: money(prediction.currentIncome),
      expense: money(prediction.currentExpense),
      savingRate,
      daysElapsed: prediction.daysElapsed,
      daysInMonth: prediction.daysInMonth,
      projectedExpense: prediction.projectedExpense,
      projectedBalance: prediction.projectedBalance,
    },
    budgets: (budgetReport?.budgets ?? []).map((b) => ({
      category: b.categoryName,
      limit: money(b.limit),
      spent: money(b.spent),
      percentUsed: b.percentUsed,
      status: b.status,
    })),
    goals: goals.map((g) => {
      const target = Number(g.targetAmount);
      const current = Number(g.currentAmount);
      return {
        name: g.goalName,
        target: money(target),
        current: money(current),
        percent: target > 0 ? Math.round((current / target) * 100) : 0,
        deadline: g.deadline ? g.deadline.toISOString().slice(0, 10) : null,
      };
    }),
    topCategoriesThisMonth: Object.entries(categoryThisMonth)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([category, amount]) => ({ category, amount: money(amount) })),
    lastWeek,
    monthlyTrend: cashflow?.series ?? [],
    recentInsightTitles: recentInsights.slice(0, 5).map((i) => i.title),
  };
}
