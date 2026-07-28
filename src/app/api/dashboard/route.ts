import { FinanceEngine } from "@/finance-engine";
import { jsonOk, withApiGuard } from "@/lib/api";

export async function GET(request: Request) {
  return withApiGuard(request, async (userId) => {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : undefined;
    const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : undefined;
    const [overview, cashflow, budgets, prediction, goals, wallets] = await Promise.all([
      FinanceEngine.getOverview(userId, from, to),
      FinanceEngine.getCashflowSeries(userId, 6),
      FinanceEngine.analyzeBudget(userId),
      FinanceEngine.predictMonthEnd(userId),
      FinanceEngine.listGoals(userId),
      FinanceEngine.listWallets(userId),
    ]);
    return jsonOk({ overview, cashflow, budgets, prediction, goals, wallets });
  });
}
