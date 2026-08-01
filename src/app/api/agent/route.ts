import { agentMessageSchema } from "@/finance-engine/schemas";
import { runFinanceAgent } from "@/ai/agent";
import { requireAiAccess } from "@/ai/entitlement";
import { resolveAiConfig } from "@/ai/resolve-config";
import { jsonOk, withApiGuard } from "@/lib/api";
import { settlePendingWalletReply } from "@/messaging/settle-wallet-reply";
import { appendHistory, clearHistory } from "@/ai/conversation-store";

export async function POST(request: Request) {
  return withApiGuard(
    request,
    async (userId) => {
      const body = agentMessageSchema.parse(await request.json());
      const settled = await settlePendingWalletReply({
        userId,
        channel: body.channel,
        reply: body.message,
      });
      if (settled) {
        await appendHistory(userId, body.channel, [
          { role: "user", content: body.message },
          { role: "assistant", content: settled },
        ]);
        return jsonOk({ text: settled, toolsUsed: [] });
      }

      // Checked after the wallet reply: settling a pending transaction is a
      // database write, not an LLM call, so it must not be paywalled.
      await requireAiAccess(userId, "CHAT");

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

export async function DELETE(request: Request) {
  return withApiGuard(request, async (userId) => {
    await clearHistory(userId, "WEB");
    return jsonOk({ cleared: true });
  });
}
