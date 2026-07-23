import { FinanceEngine } from "@/finance-engine";
import { createBudgetSchema } from "@/finance-engine/schemas";
import { jsonOk, withApiGuard } from "@/lib/api";

export async function GET(request: Request) {
  return withApiGuard(request, async (userId) => {
    const data = await FinanceEngine.analyzeBudget(userId);
    return jsonOk(data);
  });
}

export async function POST(request: Request) {
  return withApiGuard(request, async (userId) => {
    const body = createBudgetSchema.parse(await request.json());
    const data = await FinanceEngine.upsertBudget(userId, body);
    return jsonOk(data, { status: 201 });
  });
}
