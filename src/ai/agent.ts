import { toolsForOpenAICompatible, type AgentToolName } from "./tools";
import { executeToolsParallel } from "./tool-executor";
import { appendHistory, loadHistory } from "./conversation-store";
import { prisma } from "@/lib/db";
import { isWalletPromptResult } from "@/messaging/wallet-prompt";
import type { WalletPrompt } from "@/messaging/wallet-choice";
import { buildFinanceAgentSystemPrompt } from "./finance-agent-prompt";
import { getClientMessage, getVerifiedMutation } from "./tool-result";
import {
  classifyDeterministicIntent,
  enforceGroundedFigures,
  enforceWriteClaim,
  requiredToolForIntent,
} from "./intent-policy";

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
  /** Set when a transaction is held back until the user taps a wallet button. */
  walletPrompt?: WalletPrompt;
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

/** Reads that produce the authoritative figures a balance answer may cite. */
const GROUNDING_READ_TOOLS = new Set<string>([
  "getFinancialSnapshot",
  "manageWallet",
  "getTransactions",
  "generateFinancialReport",
  "getMonthlySummary",
  "financialCoach",
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

/**
 * Guarantees the account name reaches the user. The tool receipt states which
 * wallet was actually charged; the model's own sentence routinely omits it, so
 * the authoritative receipt replaces the prose whenever a wallet name is missing.
 */
export function finalText(
  modelText: string,
  writes: Array<{ walletName?: string; receipt: string }>,
): string {
  if (writes.length === 0) return modelText;
  const allNamed = writes.every(
    (write) => write.walletName && modelText.includes(write.walletName),
  );
  if (allNamed) return modelText;
  return writes.map((write) => write.receipt).join("\n\n");
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
  channel?: "TELEGRAM" | "WEB";
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
  channel: "TELEGRAM" | "WEB";
  history: AgentMessage[];
}): Promise<AgentReply> {
  const userContext = await loadUserContext(params.userId);
  const systemPrompt = buildFinanceAgentSystemPrompt({
    channel: params.channel,
    userContext,
  });

  const toolsUsed: string[] = [];
  const data: unknown[] = [];
  const writeReceipts: Array<{ walletName?: string; receipt: string }> = [];
  let writeAttempted = false;
  let walletPrompt: WalletPrompt | undefined;
  let verifiedWrite = false;

  const intent = classifyDeterministicIntent(params.message);
  const requiredTool = requiredToolForIntent(intent);
  // A read can be forced safely; forcing a write would let a misread intent
  // create a transaction the user never asked for. Writes are only nudged, and
  // a false "tercatat" claim is caught by the guard below instead.
  const forceableTool = requiredTool === "getFinancialSnapshot" ? requiredTool : undefined;

  // The model's prose is never proof. Every reply that reaches the user is
  // filtered against what the tools actually returned this turn.
  const guard = (text: string): string =>
    enforceGroundedFigures({
      text: enforceWriteClaim({
        text,
        hasVerifiedWrite: verifiedWrite,
        writeIntended: writeAttempted || intent === "CREATE_TRANSACTION",
      }),
      intent,
      ranRequiredRead: toolsUsed.some((name) => GROUNDING_READ_TOOLS.has(name)),
    });

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
    let forceRequiredTool = false;

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
            tool_choice:
              forceRequiredTool && forceableTool
                ? { type: "function", function: { name: forceableTool } }
                : "auto",
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
          forceRequiredTool = false;
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
          const clientMessages: string[] = [];
          for (let i = 0; i < results.length; i++) {
            const result = results[i].result;
            data.push(result);
            const mutation = getVerifiedMutation(result);
            if (mutation) verifiedWrite = true;
            if (isWalletPromptResult(result)) walletPrompt = result.__walletPrompt;
            const clientMessage = getClientMessage(result);
            if (clientMessage) {
              clientMessages.push(clientMessage);
              if (mutation?.kind === "transaction.created") {
                writeReceipts.push({ walletName: mutation.walletName, receipt: clientMessage });
              }
            }
            messages.push({ role: "tool", tool_call_id: msg.tool_calls[i].id, content: JSON.stringify(result) });
          }
          // This is a workflow state owned by the tool, not prose for the model
          // to reinterpret. Stop immediately and let the channel render the
          // exact account choices returned by the tool.
          if (walletPrompt) {
            return { text: walletPrompt.question, toolsUsed, data, walletPrompt };
          }
          // A pure transaction-write round already has authoritative receipts
          // from the tool. Return them directly instead of paying for another
          // model round that could paraphrase the saved facts incorrectly.
          if (
            toolCalls.every((call) => call.name === "createTransaction") &&
            clientMessages.length === toolCalls.length
          ) {
            return { text: clientMessages.join("\n\n"), toolsUsed, data };
          }
          continue;
        }

        // A required finance tool was never called, so the model is about to
        // answer a money question from its own imagination. Force the tool at
        // the transport layer rather than trusting the prose.
        if (requiredTool && !toolsUsed.includes(requiredTool) && round < MAX_AGENT_ROUNDS - 1) {
          forceRequiredTool = true;
          messages.push({ role: "assistant", content: msg.content });
          messages.push({
            role: "user",
            content: `Jawaban itu tidak sah karena dibuat tanpa data. Panggil tool ${requiredTool} sekarang, lalu jawab hanya dari hasilnya.`,
          });
          continue;
        }

        return { text: finalText(guard(msg.content || "Selesai."), writeReceipts), toolsUsed, data, walletPrompt };
      }

      return { text: incompleteAgentReply(writeAttempted && !walletPrompt), toolsUsed, data, walletPrompt };
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
          text: incompleteAgentReply(writeAttempted && !walletPrompt),
          toolsUsed,
          data,
          walletPrompt,
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
