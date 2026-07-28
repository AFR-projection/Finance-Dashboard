import { FinanceEngine } from "@/finance-engine";
import { daysAgo } from "@/lib/utils";
import { createPendingTransaction } from "@/messaging/pending-transaction";
import {
  WALLET_PROMPT_MARKER,
  listActiveWalletChoices,
  type WalletPromptToolResult,
} from "@/messaging/wallet-prompt";
import type { AgentToolName } from "./tools";

function nowInTimezone(timezone: string): {
  isoDate: string;
  time: string;
  dayName: string;
  dayNameId: string;
  unixMs: number;
} {
  const now = new Date();
  const tz = timezone || "Asia/Jakarta";
  return {
    isoDate: now.toLocaleDateString("sv-SE", { timeZone: tz }),
    time: now.toLocaleTimeString("id-ID", { timeZone: tz, hour: "2-digit", minute: "2-digit" }),
    dayName: now.toLocaleDateString("en-US", { timeZone: tz, weekday: "long" }),
    dayNameId: now.toLocaleDateString("id-ID", { timeZone: tz, weekday: "long" }),
    unixMs: now.getTime(),
  };
}

async function resolveUserTimezone(userId: string): Promise<string> {
  try {
    const { prisma } = await import("@/lib/db");
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { timezone: true },
    });
    return settings?.timezone || "Asia/Jakarta";
  } catch {
    return "Asia/Jakarta";
  }
}

// Anchor ke tengah hari UTC supaya tanggal tidak bergeser saat dirender ulang di timezone user.
function resolveTransactionDate(raw: unknown, fallbackIsoDate: string): Date {
  const candidate = typeof raw === "string" ? raw.trim().slice(0, 10) : "";
  const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : fallbackIsoDate;
  const date = new Date(`${isoDate}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? new Date(`${fallbackIsoDate}T12:00:00Z`) : date;
}

/**
 * Execute multiple independent tools in parallel.
 * Each call must NOT depend on results of other calls in the same batch.
 */
export async function executeToolsParallel(
  userId: string,
  calls: Array<{ name: AgentToolName | string; args: Record<string, unknown> }>,
  channel: "WHATSAPP" | "TELEGRAM" | "WEB" = "WEB",
): Promise<Array<{ name: string; result: unknown }>> {
  const results = await Promise.allSettled(
    calls.map((call) =>
      executeTool(userId, call.name, call.args, channel).then((result) => ({
        name: call.name,
        result,
      })),
    ),
  );
  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      name: calls[i].name,
      result: { error: r.reason?.message || "Unknown error" },
    };
  });
}

export async function executeTool(
  userId: string,
  name: AgentToolName | string,
  args: Record<string, unknown>,
  channel: "WHATSAPP" | "TELEGRAM" | "WEB" = "WEB",
): Promise<unknown> {
  try {
    switch (name) {
      case "getCurrentTime": {
        const tz = await resolveUserTimezone(userId);
        const time = nowInTimezone(tz);
        return {
          timezone: tz,
          date: time.isoDate,
          time: time.time,
          dayOfWeek: time.dayName,
          hari: time.dayNameId,
          note: `Sekarang: ${time.dayNameId}, ${time.isoDate} pukul ${time.time} ${tz}`,
        };
      }

      case "createTransaction": {
        const tz = await resolveUserTimezone(userId);
        const currentTime = nowInTimezone(tz);
        const date = resolveTransactionDate(args.transactionDate, currentTime.isoDate);
        const walletId = args.walletId ? String(args.walletId) : undefined;

        if (!walletId) {
          const wallets = await listActiveWalletChoices(userId);

          // Every balance is derived from transactions, so a transaction with no
          // account behind it can never be reflected anywhere. Refuse instead.
          if (wallets.length === 0) {
            return {
              status: "NO_WALLET",
              error:
                "Belum ada rekening aktif. Transaksi tidak dicatat sampai user membuat minimal satu rekening.",
              note: "Jangan catat transaksi ini. Minta user membuat rekening dulu (sebutkan nama bank, mata uang, dan saldo awal jika ada), lalu tawarkan untuk mencatat ulang transaksinya setelah rekening jadi.",
            };
          }

          // Guessing between several accounts would silently move the wrong
          // balance, so hold the draft and let the user choose.
          if (wallets.length > 1 && channel !== "WEB") {
            const pending = await createPendingTransaction({
              userId,
              channel,
              type: args.type as "INCOME" | "EXPENSE",
              amount: Number(args.amount),
              category: String(args.category ?? "Other"),
              description: String(args.description ?? "transaction"),
              paymentMethod: args.paymentMethod ? String(args.paymentMethod) : undefined,
              transactionDate: date,
              rawInput: args.rawInput ? String(args.rawInput) : undefined,
            });

            return {
              [WALLET_PROMPT_MARKER]: {
                pendingId: pending.id,
                question: `${args.type === "INCOME" ? "Pemasukan" : "Pengeluaran"} ${String(
                  args.description ?? "",
                )} — pilih rekening:`,
                wallets,
              },
              status: "AWAITING_WALLET_CHOICE",
              note: "Transaksi belum dicatat. Pilihan rekening sudah dikirim ke user beserta caranya memilih. Minta user memilih rekening, jangan sebut ulang daftar rekeningnya, dan jangan bilang transaksi sudah tercatat.",
            } satisfies WalletPromptToolResult;
          }
        }

        return FinanceEngine.createTransaction(userId, {
          type: args.type as "INCOME" | "EXPENSE",
          amount: Number(args.amount),
          category: String(args.category ?? "Other"),
          description: String(args.description ?? "transaction"),
          paymentMethod: args.paymentMethod ? String(args.paymentMethod) : undefined,
          transactionDate: date,
          channel,
          rawInput: args.rawInput ? String(args.rawInput) : undefined,
          walletId,
        });
      }

      case "getTransactions":
        return FinanceEngine.getTransactions(userId, {
          type: args.type as "INCOME" | "EXPENSE" | undefined,
          search: args.search ? String(args.search) : undefined,
          from: daysAgo(Number(args.days ?? 30)),
          limit: Number(args.limit ?? 20),
          walletId: args.walletId ? String(args.walletId) : undefined,
        });

      case "deleteTransaction": {
        const id = String(args.id ?? "");
        if (!id) return { error: "Transaction ID required" };
        return FinanceEngine.deleteTransaction(userId, id);
      }

      case "updateTransaction": {
        const id = String(args.id ?? "");
        if (!id) return { error: "Transaction ID required" };
        return FinanceEngine.updateTransaction(userId, id, {
          type: args.type as "INCOME" | "EXPENSE" | undefined,
          amount: args.amount != null ? Number(args.amount) : undefined,
          category: args.category ? String(args.category) : undefined,
          description: args.description ? String(args.description) : undefined,
        });
      }

      case "generateFinancialReport":
        return FinanceEngine.generateFinancialReport(userId, Number(args.days ?? 30));

      case "analyzeBudget":
        return FinanceEngine.analyzeBudget(
          userId,
          args.month ? Number(args.month) : undefined,
          args.year ? Number(args.year) : undefined,
        );

      case "manageBudget": {
        const category = String(args.category ?? "");
        const monthlyLimit = Number(args.monthlyLimit);
        if (!category || !monthlyLimit) return { error: "Category and monthlyLimit required" };
        const now = new Date();
        const month = args.month ? Number(args.month) : now.getMonth() + 1;
        const year = args.year ? Number(args.year) : now.getFullYear();
        const categoryId = await resolveCategoryByName(userId, category);
        if (!categoryId) return { error: `Category "${category}" not found` };
        return FinanceEngine.upsertBudget(userId, { categoryId, monthlyLimit, month, year });
      }

      case "manageGoal": {
        const action = String(args.action ?? "list");
        if (action === "list") return FinanceEngine.listGoals(userId);
        if (action === "create") {
          return FinanceEngine.createGoal(userId, {
            goalName: String(args.goalName ?? "Goal"),
            targetAmount: Number(args.targetAmount ?? 0),
            currentAmount: Number(args.currentAmount ?? 0),
            deadline: args.deadline ? new Date(String(args.deadline)) : undefined,
          });
        }
        return { error: `Unknown action: ${action}. Use list or create.` };
      }

      case "financialCoach": {
        const [report, prediction, budgets, goals] = await Promise.all([
          FinanceEngine.generateFinancialReport(userId, 30),
          FinanceEngine.predictMonthEnd(userId),
          FinanceEngine.analyzeBudget(userId),
          FinanceEngine.listGoals(userId),
        ]);
        const focus = String(args.focus ?? "general");
        return {
          focus,
          summary: {
            savingRate: report.savingRate,
            healthScore: report.healthScore,
            topCategory: report.largestCategory?.name ?? null,
            topCategoryPct: report.largestCategory
              ? Math.round((report.largestCategory.amount / report.totalExpense) * 100) : null,
            totalIncome: report.totalIncome,
            totalExpense: report.totalExpense,
            balance: report.balance,
            projectedBalance: prediction.projectedBalance,
            riskOverspend: prediction.riskOverspend,
            budgetWarnings: budgets.budgets.filter((b) => b.status !== "ok"),
            activeGoals: goals.length,
          },
          recommendations: report.recommendations,
        };
      }

      case "predictFinances":
        return FinanceEngine.predictMonthEnd(userId);

      case "analyzeCashflowTrend": {
        const months = Number(args.months ?? 6);
        const { currency, series } = await FinanceEngine.getCashflowSeries(userId, months);
        const avgIncome = series.reduce((s, m) => s + m.income, 0) / series.length;
        const avgExpense = series.reduce((s, m) => s + m.expense, 0) / series.length;
        return {
          currency,
          months: series,
          avgMonthlyIncome: Math.round(avgIncome),
          avgMonthlyExpense: Math.round(avgExpense),
          avgMonthlyBalance: Math.round(avgIncome - avgExpense),
          trend: avgIncome - avgExpense >= 0 ? "positive" : "negative",
          totalMonths: series.length,
        };
      }

      case "getMonthlySummary": {
        const now = new Date();
        const month = args.month ? Number(args.month) : now.getMonth() + 1;
        const year = args.year ? Number(args.year) : now.getFullYear();
        const from = new Date(year, month - 1, 1);
        const to = new Date(year, month, 0, 23, 59, 59);
        const [overview, budgets_] = await Promise.all([
          FinanceEngine.getOverview(userId, from, to),
          FinanceEngine.analyzeBudget(userId, month, year),
        ]);
        return { ...overview, month, year, budgets: budgets_.budgets };
      }

      case "comparePeriods": {
        const period1Days = Number(args.period1Days ?? 30);
        const period2Days = Number(args.period2Days ?? 60);
        const now = new Date();
        const p1From = daysAgo(period1Days);
        const p2From = daysAgo(period2Days);
        const p2To = daysAgo(period1Days);
        const [p1, p2] = await Promise.all([
          FinanceEngine.getOverview(userId, p1From, now),
          FinanceEngine.getOverview(userId, p2From, p2To),
        ]);
        return {
          period1: { label: `Last ${period1Days} days`, ...p1 },
          period2: { label: `Prior (day ${period1Days}-${period2Days} ago)`, ...p2 },
          changes: {
            expenseChange: p1.totalExpense - p2.totalExpense,
            expenseChangePct: p2.totalExpense > 0
              ? Math.round(((p1.totalExpense - p2.totalExpense) / p2.totalExpense) * 100) : null,
            incomeChange: p1.totalIncome - p2.totalIncome,
            incomeChangePct: p2.totalIncome > 0
              ? Math.round(((p1.totalIncome - p2.totalIncome) / p2.totalIncome) * 100) : null,
            savingRateChange: Math.round((p1.savingRate - p2.savingRate) * 10) / 10,
          },
        };
      }

      case "analyzeSpendingPattern": {
        const days = Number(args.days ?? 90);
        const from = daysAgo(days);
        const txs = await FinanceEngine.getTransactions(userId, { from, limit: 500 });
        const items = txs.items as unknown as Array<{
          amount: number; type: string; category: { name: string } | null;
          description: string; transactionDate: string; paymentMethod?: string;
        }>;

        const weekdayTotals: Record<string, number> = {};
        const weekendTotals: Record<string, number> = {};
        const dayCount: Record<string, number> = {};
        const descFrequency: Record<string, number> = {};
        const categoryTotals: Record<string, number> = {};
        let totalExpenses = 0;

        for (const tx of items) {
          if (tx.type !== "EXPENSE") continue;
          const amt = Number(tx.amount);
          totalExpenses += amt;
          const d = new Date(tx.transactionDate);
          const day = d.getDay();
          const catName = tx.category?.name ?? "Other";
          categoryTotals[catName] = (categoryTotals[catName] || 0) + amt;
          const desc = tx.description.toLowerCase();
          descFrequency[desc] = (descFrequency[desc] || 0) + 1;

          if (day === 0 || day === 6) {
            weekendTotals[catName] = (weekendTotals[catName] || 0) + amt;
          } else {
            weekdayTotals[catName] = (weekdayTotals[catName] || 0) + amt;
          }
          dayCount[catName] = (dayCount[catName] || 0) + 1;
        }

        const avgPerTx = totalExpenses / (Object.values(dayCount).reduce((a, b) => a + b, 0) || 1);
        const recurring = Object.entries(descFrequency)
          .filter(([, count]) => count >= 3)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5);

        return {
          totalExpensesAnalyzed: totalExpenses,
          transactionCount: Object.values(dayCount).reduce((a, b) => a + b, 0),
          averagePerTransaction: Math.round(avgPerTx),
          categoryBreakdown: Object.entries(categoryTotals)
            .sort(([, a], [, b]) => b - a)
            .map(([name, amount]) => ({
              name,
              amount: Math.round(amount),
              pct: Math.round((amount / totalExpenses) * 100),
              transactionCount: dayCount[name] || 0,
            })),
          weekendVsWeekday: {
            weekendTotal: Math.round(Object.values(weekendTotals).reduce((a, b) => a + b, 0)),
            weekdayTotal: Math.round(Object.values(weekdayTotals).reduce((a, b) => a + b, 0)),
          },
          potentialRecurring: recurring.map(([desc, count]) => ({ description: desc, frequency: count })),
          note: "Category breakdown includes percentage of total spend for each category.",
        };
      }

      case "detectAnomalies": {
        const days = Number(args.days ?? 90);
        const from = daysAgo(days);
        const txs = await FinanceEngine.getTransactions(userId, { from, limit: 500 });
        const items = txs.items as unknown as Array<{
          id: string; amount: number; type: string; category: { name: string } | null;
          description: string; transactionDate: string; paymentMethod?: string;
        }>;

        const catStats: Record<string, { amounts: number[]; sum: number; count: number }> = {};
        const anomalies: Array<{
          id: string; description: string; amount: number; category: string;
          date: string; reason: string; severity: "low" | "medium" | "high";
        }> = [];

        for (const tx of items) {
          if (tx.type !== "EXPENSE") continue;
          const catName = tx.category?.name ?? "Other";
          const amt = Number(tx.amount);
          if (!catStats[catName]) catStats[catName] = { amounts: [], sum: 0, count: 0 };
          catStats[catName].amounts.push(amt);
          catStats[catName].sum += amt;
          catStats[catName].count++;
        }

        for (const tx of items) {
          if (tx.type !== "EXPENSE") continue;
          const catName = tx.category?.name ?? "Other";
          const amt = Number(tx.amount);
          const stats = catStats[catName];
          if (!stats || stats.count < 2) continue;
          const mean = stats.sum / stats.count;
          const variance = stats.amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / stats.count;
          const stdDev = Math.sqrt(variance);
          const zScore = stdDev > 0 ? (amt - mean) / stdDev : 0;

          if (Math.abs(zScore) > 2.5) {
            anomalies.push({
              id: tx.id,
              description: tx.description,
              amount: Math.round(amt),
              category: catName,
              date: new Date(tx.transactionDate).toLocaleDateString("id-ID"),
              reason: Math.abs(zScore) > 3
                ? `Amount ${Math.round(amt).toLocaleString("id-ID")} is ${Math.abs(zScore).toFixed(1)}σ from category average ${Math.round(mean).toLocaleString("id-ID")}`
                : `Above typical ${catName} spending`,
              severity: Math.abs(zScore) > 3 ? "high" : "medium",
            });
          }
        }

        const dupes: Record<string, { count: number; items: Array<{ id: string; description: string; amount: number; category: { name: string } | null; transactionDate: string }> }> = {};
        for (const tx of items) {
          if (tx.type !== "EXPENSE") continue;
          const key = `${tx.description}|${tx.amount}`;
          if (!dupes[key]) dupes[key] = { count: 0, items: [] };
          dupes[key].count++;
          dupes[key].items.push(tx);
        }
        for (const [, v] of Object.entries(dupes)) {
          if (v.count > 1 && v.items.length > 1) {
            const dates = v.items.map((i: { transactionDate: string }) =>
              new Date(i.transactionDate).toLocaleDateString("id-ID"),
            );
            if (new Set(dates).size === v.count) {
              anomalies.push({
                id: v.items[0].id,
                description: v.items[0].description,
                amount: Number(v.items[0].amount),
                category: v.items[0].category?.name ?? "Other",
                date: dates.join(", "),
                reason: `Duplicated ${v.count}x: same description and amount on different dates`,
                severity: "low",
              });
            }
          }
        }

        return {
          totalTransactions: items.filter((t) => t.type === "EXPENSE").length,
          anomaliesFound: anomalies.length,
          anomalies: anomalies.sort((a, b) => {
            const order = { high: 0, medium: 1, low: 2 };
            return order[a.severity] - order[b.severity];
          }),
        };
      }

      case "getSavingsSuggestions": {
        const [report, prediction] = await Promise.all([
          FinanceEngine.generateFinancialReport(userId, 90),
          FinanceEngine.predictMonthEnd(userId),
        ]);
        const txs = await FinanceEngine.getTransactions(userId, { from: daysAgo(90), limit: 500 });
        const items = txs.items as unknown as Array<{
          amount: number; type: string; category: { name: string } | null;
          description: string; transactionDate: string;
        }>;

        const catSpend: Record<string, { total: number; count: number; descriptions: string[] }> = {};
        for (const tx of items) {
          if (tx.type !== "EXPENSE") continue;
          const cat = tx.category?.name ?? "Other";
          if (!catSpend[cat]) catSpend[cat] = { total: 0, count: 0, descriptions: [] };
          catSpend[cat].total += Number(tx.amount);
          catSpend[cat].count++;
          if (!catSpend[cat].descriptions.includes(tx.description)) {
            catSpend[cat].descriptions.push(tx.description);
          }
        }

        const suggestions: Array<{ category: string; currentSpend: number; potentialSaving: number; tip: string }> = [];
        for (const [cat, data] of Object.entries(catSpend)) {
          const avgMonthly = Math.round(data.total / 3);
          if (avgMonthly > 100000 && cat !== "Salary" && cat !== "Freelance") {
            const saving = Math.round(avgMonthly * 0.15);
            suggestions.push({
              category: cat,
              currentSpend: avgMonthly,
              potentialSaving: saving,
              tip: saving > 50000
                ? `Kurangi ${cat} Rp${saving.toLocaleString("id-ID")}/bln (15% dari rata-rata Rp${avgMonthly.toLocaleString("id-ID")})`
                : `Optimasi ${cat} hemat Rp${saving.toLocaleString("id-ID")}/bln`,
            });
          }
        }

        return {
          monthlyIncome: report.totalIncome,
          monthlyExpense: report.totalExpense,
          currentSavingRate: report.savingRate,
          healthScore: report.healthScore,
          projectedBalance: prediction.projectedBalance,
          potentialSavings: suggestions.sort((a, b) => b.potentialSaving - a.potentialSaving),
          totalPotentialMonthlySaving: suggestions.reduce((s, x) => s + x.potentialSaving, 0),
          targetSavingRate: Math.min(report.savingRate + 10, 30),
        };
      }

      case "rememberFact":
        return FinanceEngine.upsertAiMemory(userId, {
          key: String(args.key ?? ""),
          content: String(args.content ?? ""),
        });

      case "recallMemories":
        return FinanceEngine.listAiMemories(userId);

      case "manageWallet": {
        const action = String(args.action ?? "list");
        if (action === "list") return FinanceEngine.listWallets(userId);
        if (action === "create") {
          return FinanceEngine.createWallet(userId, {
            name: String(args.name ?? ""),
            currency: String(args.currency ?? "IDR"),
            color: args.color ? String(args.color) : undefined,
            isDefault: args.isDefault === true,
            initialBalance:
              args.initialBalance !== undefined && args.initialBalance !== null
                ? Number(args.initialBalance)
                : undefined,
          });
        }
        if (action === "update") {
          const id = String(args.id ?? "");
          if (!id) return { error: "Wallet ID required for update" };
          return FinanceEngine.updateWallet(userId, {
            id,
            name: args.name ? String(args.name) : undefined,
            currency: args.currency ? String(args.currency) : undefined,
            color: args.color ? String(args.color) : undefined,
            isDefault: args.isDefault !== undefined ? Boolean(args.isDefault) : undefined,
          });
        }
        if (action === "delete") {
          const id = String(args.id ?? "");
          if (!id) return { error: "Wallet ID required for delete" };
          return FinanceEngine.deleteWallet(userId, id);
        }
        return { error: `Unknown action: ${action}. Use list, create, update, or delete.` };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { error: message };
  }
}

async function resolveCategoryByName(userId: string, name: string): Promise<string | null> {
  const { prisma } = await import("@/lib/db");
  const category = await prisma.category.findFirst({
    where: { userId, name: { equals: name, mode: "insensitive" }, type: "EXPENSE" },
  });
  return category?.id ?? null;
}
