import { FinanceEngine } from "@/finance-engine";
import { createTransactionSchema, listTransactionsSchema } from "@/finance-engine/schemas";
import { jsonOk, withApiGuard } from "@/lib/api";

export async function GET(request: Request) {
  return withApiGuard(request, async (userId) => {
    const { searchParams } = new URL(request.url);
    const query = listTransactionsSchema.parse(Object.fromEntries(searchParams));
    const data = await FinanceEngine.getTransactions(userId, query);
    return jsonOk(data);
  });
}

export async function POST(request: Request) {
  return withApiGuard(
    request,
    async (userId) => {
      const body = createTransactionSchema.parse(await request.json());
      const data = await FinanceEngine.createTransaction(userId, body);
      return jsonOk(data, { status: 201 });
    },
    { rateLimitKey: "tx-write", limit: 120 },
  );
}
