import { toolsForOpenAICompatible, type AgentToolName } from "./tools";
import { executeToolsParallel } from "./tool-executor";
import { appendHistory, loadHistory } from "./conversation-store";
import { prisma } from "@/lib/db";

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

const SYSTEM_PROMPT = `You are AI Finance Agent — a professional personal finance assistant for Indonesian users.

## RULES
- Speak in Bahasa Indonesia or English. Reply naturally.
- "25 ribu" = 25000, "7 juta" = 7000000.
- NEVER invent data. Always call tools for reads/writes.
- After tool calls, reply with clear confirmed numbers.
- Be practical, non-judgmental, and action-oriented.

## TIMEZONE
The user's current local date is in USER CONTEXT below — use it, never the server date.
- Omit transactionDate for "hari ini", "tadi", "barusan" (defaults to the user's today).
- Only pass transactionDate (YYYY-MM-DD) for other days, e.g. "kemarin" = one day before the local date.

## REASONING
- Understand intent → select best tool → analyze results → answer.
- "cek keuangan" = generateFinancialReport.
- For coaching/advice, gather data via multiple tools first, then synthesize.
- When multiple independent data points needed, call tools together.
- After creating a transaction, mention the current balance if relevant.`;

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
  const systemPrompt = `${SYSTEM_PROMPT}\n\n## USER CONTEXT\n${userContext}`;

  const toolsUsed: string[] = [];
  const data: unknown[] = [];

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
      for (let round = 0; round < 3; round++) {
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
            return { name: call.function.name as AgentToolName, args: { ...args, rawInput: params.message } };
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

      return { text: "Permintaan terlalu kompleks. Coba pecah pesan.", toolsUsed, data };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown";
      // Tool sudah menulis ke database — mencoba model lain akan menjalankannya ulang.
      if (toolsUsed.length > 0) {
        return {
          text: `Data sudah tersimpan, tapi saya gagal menyusun balasan. (${lastError})`,
          toolsUsed,
          data,
        };
      }
    }
  }

  return { text: `Maaf, terjadi kesalahan: ${lastError}. Coba lagi.`, toolsUsed, data };
}

function buildModelChain(config: AiRuntimeConfig): { primary: string; fallbacks: string[] } {
  const primary = config.model || "openai/gpt-4o-mini";
  const fallbacks = (config.fallbackModels ?? []).filter((m) => m && m !== primary).slice(0, 2);
  return { primary, fallbacks };
}
