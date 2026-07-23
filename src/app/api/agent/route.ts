import { agentMessageSchema } from "@/finance-engine/schemas";
import { runFinanceAgent } from "@/ai/agent";
import { resolveAiConfig } from "@/ai/resolve-config";
import { jsonOk, withApiGuard } from "@/lib/api";

export async function POST(request: Request) {
  return withApiGuard(
    request,
    async (userId) => {
      const body = agentMessageSchema.parse(await request.json());
      const config = await resolveAiConfig(userId);
      const reply = await runFinanceAgent({
        userId,
        message: body.message,
        config,
        channel: body.channel,
      });
      return jsonOk(reply);
    },
    { rateLimitKey: "agent", limit: 40 },
  );
}
