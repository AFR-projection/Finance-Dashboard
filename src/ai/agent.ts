import { toolsForOpenAICompatible, type AgentToolName } from "./tools";
import { executeToolsParallel } from "./tool-executor";
import { appendHistory, loadHistory } from "./conversation-store";
import { prisma } from "@/lib/db";
import { buildFinanceAgentSystemPrompt } from "./finance-agent-prompt";

export type AiRuntimeConfig = {
  provider: "OPENROUTER";
  model: string;
  apiKey: string;
  fallbackModels?: string[];
};

export type AgentReply = {
  text: string;
  toolsUsed: string[];
  data?: unknown[];
};

export type AgentMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_AGENT_ROUNDS = 4;
const ALWAYS_MUTATING_TOOLS = new Set<AgentToolName>([
  "createTransaction",
  "updateTransaction",
  "deleteTransaction",
  "manageBudget",
  "rememberFact",
]);

function isMutatingToolCall(name: AgentToolName, args: Record<string, unknown>): boolean {
  if (name === "manageGoal") return args.action === "create";
  return ALWAYS_MUTATING_TOOLS.has(name);
}

function incompleteAgentReply(writeAttempted: boolean): string {
  return writeAttempted
    ? "Proses perubahan data sudah dijalankan, tetapi saya gagal menyusun konfirmasi akhirnya. Periksa dashboard sebelum mencoba lagi agar transaksi tidak tercatat dua kali."
    : "Permintaan data sudah diproses, tetapi saya belum bisa menyusun analisisnya. Silakan coba lagi sebentar lagi.";
}

function nowInTimezone(timezone: string): { isoDate: string; time: string; dayNameId: string } {
  const now = new Date();
  const tz = timezone || "Asia/Jakarta";
  return {
    isoDate: now.toLocaleDateString("sv-SE", { timeZone: tz }),
    time: now.toLocaleTimeString("id-ID", { timeZone: tz, hour: "2-digit", minute: "2-digit" }),
    dayNameId: now.toLocaleDateString("id-ID", { timeZone: tz, weekday: "long" }),
  };
}

async function loadUserContext(userId: string): Promise<string> {
  try {
    const [memories, settings, recentTxs, goalCount] = await Promise.all([
      prisma.aiMemory.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 20 }),
      prisma.userSettings.findUnique({ where: { userId } }),
      prisma.transaction.findMany({
        where: { userId },
        orderBy: { transactionDate: "desc" },
        take: 5,
        include: { category: true },
      }),
      prisma.financialGoal.count({ where: { userId } }),
    ]);

    const currency = settings?.currency ?? "IDR";
    const timezone = settings?.timezone ?? "Asia/Jakarta";
    const tzTime = nowInTimezone(timezone);

    const lines: string[] = [];
    lines.push(`Timezone: ${timezone}`);
    lines.push(`Currency: ${currency}`);
    lines.push(`Current local time: ${tzTime.dayNameId}, ${tzTime.isoDate} ${tzTime.time}`);
    lines.push(`Active goals: ${goalCount}`);

    if (memories.length > 0) {
      lines.push("---");
      for (const m of memories) lines.push(`- ${m.key}: ${m.content}`);
    }

    if (recentTxs.length > 0) {
      lines.push("---");
      for (const t of recentTxs) {
        const amt = currency === "IDR"
          ? `Rp${Number(t.amount).toLocaleString("id-ID")}`
          : `${currency} ${Number(t.amount).toFixed(2)}`;
        lines.push(`${t.type === "INCOME" ? "+" : "-"} ${t.category?.name ?? "?"}: ${amt} — ${t.description}`);
      }
    }

    return lines.join("\n");
  } catch {
    return "Timezone: Asia/Jakarta\nCurrency: IDR";
  }
}

export async function runFinanceAgent(params: {
  userId: string;
  message: string;
  config: AiRuntimeConfig;
  channel?: "WHATSAPP" | "TELEGRAM" | "WEB";
}): Promise<AgentReply> {
  const { userId, message, config, channel = "WEB" } = params;
  if (!config.apiKey) {
    return {
      text: "API key AI belum dikonfigurasi. Buka Settings > AI Provider.",
      toolsUsed: [],
    };
  }

  const history = await loadHistory(userId, channel);
  const reply = await runOpenRouter({ userId, message, config, channel, history });

  await appendHistory(userId, channel, [
    { role: "user", content: message },
    { role: "assistant", content: reply.text },
  ]);

  return reply;
}

async function runOpenRouter(params: {
  userId: string;
  message: string;
  config: AiRuntimeConfig;
  channel: "WHATSAPP" | "TELEGRAM" | "WEB";
  history: AgentMessage[];
}): Promise<AgentReply> {
  const userContext = await loadUserContext(params.userId);
  const systemPrompt = buildFinanceAgentSystemPrompt({
    channel: params.channel,
    userContext,
  });

  const toolsUsed: string[] = [];
  const data: unknown[] = [];
  let writeAttempted = false;

  type Msg = {
    role: "system" | "user" | "assistant" | "tool";
    content: string | null;
    tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
    tool_call_id?: string;
  };

  const { primary, fallbacks } = buildModelChain(params.config);
  let lastError = "Unknown";

  for (const currentModel of [primary, ...fallbacks]) {
    const messages: Msg[] = [
      { role: "system", content: systemPrompt },
      ...params.history.map((m) => ({ role: m.role, content: m.content }) as Msg),
      { role: "user", content: params.message },
    ];

    try {
      for (let round = 0; round < MAX_AGENT_ROUNDS; round++) {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${params.config.apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
            "X-Title": "Ledgerly Finance Agent",
          },
          body: JSON.stringify({
            model: currentModel,
            messages,
            tools: toolsForOpenAICompatible(),
            tool_choice: "auto",
            temperature: 0.2,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`OpenRouter ${res.status}: ${errText}`);
        }

        const json = (await res.json()) as {
          choices: Array<{
            message: Msg & {
              tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
            };
          }>;
        };

        const msg = json.choices[0]?.message;
        if (!msg) throw new Error("Empty response");

        if (msg.tool_calls?.length) {
          messages.push({ role: "assistant", content: msg.content, tool_calls: msg.tool_calls });

          const toolCalls = msg.tool_calls.map((call) => {
            toolsUsed.push(call.function.name);
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(call.function.arguments || "{}"); } catch { args = {}; }
            const name = call.function.name as AgentToolName;
            if (isMutatingToolCall(name, args)) writeAttempted = true;
            return { name, args: { ...args, rawInput: params.message } };
          });

          const results = await executeToolsParallel(params.userId, toolCalls, params.channel);
          for (let i = 0; i < results.length; i++) {
            data.push(results[i].result);
            messages.push({ role: "tool", tool_call_id: msg.tool_calls[i].id, content: JSON.stringify(results[i].result) });
          }
          continue;
        }

        return { text: msg.content || "Selesai.", toolsUsed, data };
      }

      return { text: incompleteAgentReply(writeAttempted), toolsUsed, data };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown";
      // Tool sudah menulis ke database — mencoba model lain akan menjalankannya ulang.
      if (toolsUsed.length > 0) {
        console.error("[finance-agent] Provider failed after tool execution", {
          model: currentModel,
          toolsUsed,
          error: lastError,
        });
        return {
          text: incompleteAgentReply(writeAttempted),
          toolsUsed,
          data,
        };
      }
    }
  }

  console.error("[finance-agent] All provider models failed", { error: lastError });
  return {
    text: "Maaf, layanan analisis keuangan sedang tidak tersedia. Data Anda tidak diubah; silakan coba lagi sebentar lagi.",
    toolsUsed,
    data,
  };
}

function buildModelChain(config: AiRuntimeConfig): { primary: string; fallbacks: string[] } {
  const primary = config.model || "openai/gpt-4o-mini";
  const fallbacks = (config.fallbackModels ?? []).filter((m) => m && m !== primary).slice(0, 2);
  return { primary, fallbacks };
}
