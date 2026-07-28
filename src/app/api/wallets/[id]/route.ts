import { FinanceEngine } from "@/finance-engine";
import { updateWalletSchema } from "@/finance-engine/schemas";
import { jsonOk, withApiGuard } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  return withApiGuard(request, async (userId) => {
    const { id } = await params;
    const body = updateWalletSchema.parse({ ...(await request.json()), id });
    const data = await FinanceEngine.updateWallet(userId, body);
    return jsonOk(data);
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return withApiGuard(request, async (userId) => {
    const { id } = await params;
    const data = await FinanceEngine.deleteWallet(userId, id);
    return jsonOk(data);
  });
}
