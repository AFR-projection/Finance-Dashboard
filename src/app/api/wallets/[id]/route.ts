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

/**
 * `?purge=1` removes the row entirely; the default only deactivates. Two verbs
 * on one route because the UI offers both and the distinction matters: one is
 * reversible, the other is not.
 */
export async function DELETE(request: Request, { params }: Params) {
  return withApiGuard(request, async (userId) => {
    const { id } = await params;
    const purge = new URL(request.url).searchParams.get("purge") === "1";
    const data = purge
      ? await FinanceEngine.purgeWallet(userId, id)
      : await FinanceEngine.deleteWallet(userId, id);
    return jsonOk(data);
  });
}
