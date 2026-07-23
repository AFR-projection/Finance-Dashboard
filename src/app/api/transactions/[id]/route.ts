import { FinanceEngine } from "@/finance-engine";
import { createTransactionSchema } from "@/finance-engine/schemas";
import { jsonOk, withApiGuard } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  return withApiGuard(request, async (userId) => {
    const { id } = await params;
    const body = createTransactionSchema.partial().parse(await request.json());
    const data = await FinanceEngine.updateTransaction(userId, id, body);
    return jsonOk(data);
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return withApiGuard(request, async (userId) => {
    const { id } = await params;
    const data = await FinanceEngine.deleteTransaction(userId, id);
    return jsonOk(data);
  });
}
