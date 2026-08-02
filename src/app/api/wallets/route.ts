import { FinanceEngine } from "@/finance-engine";
import { createWalletSchema } from "@/finance-engine/schemas";
import { jsonOk, withApiGuard } from "@/lib/api";

export async function GET(request: Request) {
  return withApiGuard(request, async (userId) => {
    // The accounts page asks for everything so deactivated wallets stay
    // visible and reactivatable; other callers get active ones only.
    const includeInactive = new URL(request.url).searchParams.get("all") === "1";
    const data = await FinanceEngine.listWallets(userId, { includeInactive });
    return jsonOk(data);
  });
}

export async function POST(request: Request) {
  return withApiGuard(request, async (userId) => {
    const body = createWalletSchema.parse(await request.json());
    const data = await FinanceEngine.createWallet(userId, body);
    return jsonOk(data, { status: 201 });
  });
}
