import { FinanceEngine } from "@/finance-engine";
import { daysAgo } from "@/lib/utils";
import type { AgentToolName } from "./tools";

export async function executeTool(
  userId: string,
  name: AgentToolName | string,
  args: Record<string, unknown>,
  channel: "WHATSAPP" | "TELEGRAM" | "WEB" = "WEB",
): Promise<unknown> {
  switch (name) {
    case "createTransaction": {
      const date =
        typeof args.transactionDate === "string" && args.transactionDate
          ? new Date(args.transactionDate)
          : undefined;
      return FinanceEngine.createTransaction(userId, {
        type: args.type as "INCOME" | "EXPENSE",
        amount: Number(args.amount),
        category: String(args.category ?? "Other"),
        description: String(args.description ?? "transaction"),
        paymentMethod: args.paymentMethod ? String(args.paymentMethod) : undefined,
        transactionDate: date,
        channel,
        rawInput: args.rawInput ? String(args.rawInput) : undefined,
      });
    }
    case "getTransactions": {
      const days = Number(args.days ?? 30);
      return FinanceEngine.getTransactions(userId, {
        type: args.type as "INCOME" | "EXPENSE" | undefined,
        search: args.search ? String(args.search) : undefined,
        from: daysAgo(days),
        limit: Number(args.limit ?? 20),
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
    case "financialCoach": {
      const report = await FinanceEngine.generateFinancialReport(userId, 30);
      const prediction = await FinanceEngine.predictMonthEnd(userId);
      const budgets = await FinanceEngine.analyzeBudget(userId);
      const focus = String(args.focus ?? "general");
      return {
        focus,
        summary: {
          savingRate: report.savingRate,
          healthScore: report.healthScore,
          topCategory: report.largestCategory?.name ?? null,
          projectedBalance: prediction.projectedBalance,
          riskOverspend: prediction.riskOverspend,
          budgetWarnings: budgets.budgets.filter((b) => b.status !== "ok"),
        },
        recommendations: report.recommendations,
        coachPromptHints: [
          focus === "saving"
            ? "Prioritize increasing saving rate toward 20%+."
            : focus === "budget"
              ? "Focus on categories near or over budget."
              : "Give balanced coaching with one concrete next action.",
        ],
      };
    }
    case "predictFinances":
      return FinanceEngine.predictMonthEnd(userId);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
