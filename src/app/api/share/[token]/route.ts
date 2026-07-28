import { NextResponse } from "next/server";
import { FinanceEngine } from "@/finance-engine";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ token: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const profile = await prisma.shareProfile.findUnique({
    where: { token },
    include: { user: { select: { name: true, image: true } } },
  });

  if (!profile || profile.visibility === "PRIVATE") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const overview = await FinanceEngine.getOverview(profile.userId);
  const cashflow = profile.showCharts
    ? await FinanceEngine.getCashflowSeries(profile.userId, 6)
    : { currency: overview.currency, series: [] };
  const goals = profile.showGoals ? await FinanceEngine.listGoals(profile.userId) : [];

  return NextResponse.json({
    ok: true,
    data: {
      displayName: profile.displayName || profile.user.name || "Finance Profile",
      avatar: profile.user.image,
      visibility: profile.visibility,
      currency: overview.currency,
      balance: profile.showBalance ? overview.balance : null,
      totalIncome: profile.showIncome ? overview.totalIncome : null,
      totalExpense: profile.showExpense ? overview.totalExpense : null,
      savingRate: profile.showIncome && profile.showExpense ? overview.savingRate : null,
      healthScore: overview.healthScore,
      topCategories: profile.showExpense ? overview.topCategories : [],
      cashflow,
      goals: goals.map((g) => ({
        goalName: g.goalName,
        targetAmount: Number(g.targetAmount),
        currentAmount: Number(g.currentAmount),
        deadline: g.deadline,
      })),
      // Never expose raw transaction list on public share by default
      transactionsExposed: false,
    },
  });
}
