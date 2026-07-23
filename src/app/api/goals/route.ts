import { FinanceEngine, FinanceEngineError } from "@/finance-engine";
import { jsonOk, withApiGuard } from "@/lib/api";

export async function GET(request: Request) {
  return withApiGuard(request, async (userId) => {
    const goals = await FinanceEngine.listGoals(userId);
    return jsonOk({
      items: goals.map((g) => ({
        id: g.id,
        goalName: g.goalName,
        targetAmount: Number(g.targetAmount),
        currentAmount: Number(g.currentAmount),
        deadline: g.deadline,
        progress:
          Number(g.targetAmount) > 0
            ? Math.min(100, Math.round((Number(g.currentAmount) / Number(g.targetAmount)) * 100))
            : 0,
        createdAt: g.createdAt,
      })),
    });
  });
}

export async function POST(request: Request) {
  return withApiGuard(request, async (userId) => {
    const body = await request.json();
    const goal = await FinanceEngine.createGoal(userId, body);
    return jsonOk({
      id: goal.id,
      goalName: goal.goalName,
      targetAmount: Number(goal.targetAmount),
      currentAmount: Number(goal.currentAmount),
      deadline: goal.deadline,
    });
  });
}

export async function PATCH(request: Request) {
  return withApiGuard(request, async (userId) => {
    const body = await request.json();
    const goal = await FinanceEngine.updateGoal(userId, body);
    return jsonOk({
      id: goal.id,
      goalName: goal.goalName,
      targetAmount: Number(goal.targetAmount),
      currentAmount: Number(goal.currentAmount),
      deadline: goal.deadline,
    });
  });
}

export async function DELETE(request: Request) {
  return withApiGuard(request, async (userId) => {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      throw new FinanceEngineError("id required", "VALIDATION", 400);
    }
    const result = await FinanceEngine.deleteGoal(userId, id);
    return jsonOk(result);
  });
}
