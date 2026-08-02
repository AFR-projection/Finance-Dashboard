import { toolsForOpenAICompatible, type AgentToolName } from "./tools";
import { executeToolsParallel } from "./tool-executor";
import { appendHistory, loadHistory } from "./conversation-store";
import { rankMemories } from "./memory-retrieval";
import { FinanceEngine } from "@/finance-engine";
import { prisma } from "@/lib/db";
import { isWalletPromptResult } from "@/messaging/wallet-prompt";
import type { WalletPrompt } from "@/messaging/wallet-choice";
import { buildFinanceAgentSystemPrompt } from "./finance-agent-prompt";
import { recordAiUsage } from "./usage";
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
  /**
   * Every draft awaiting an account, in the order the user dictated them.
   * A message like "taxi 1.39, makan 6.50, rokok 1.50" creates three drafts;
   * surfacing only the first one stranded the rest as invisible pending rows.
   */
  walletPrompts?: WalletPrompt[];
  /** Tokens burned across every round and every model in the fallback chain. */
  usage?: { promptTokens: number; outputTokens: number; model: string };
};

export type AgentMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_AGENT_ROUNDS = 6;
/**
 * Ceiling on total tool calls per request so a looping model cannot run up cost.
 * Sized to fit a realistic dictation batch — someone listing a day's spending
 * can easily reach a dozen entries, and silently dropping the tail would be
 * worse than the extra tokens.
 */
const MAX_TOOL_CALLS = 30;
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

function formatAmount(value: number, currency: string): string {
  return currency === "IDR"
    ? `Rp${Math.round(value).toLocaleString("id-ID")}`
    : `${currency} ${value.toFixed(2)}`;
}

async function loadUserContext(userId: string, message: string): Promise<string> {
  try {
    const [memories, settings, recentTxs, goals, wallets, budgetReport, prediction, insights] =
      await Promise.all([
        prisma.aiMemory.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 60 }),
        prisma.userSettings.findUnique({ where: { userId } }),
        prisma.transaction.findMany({
          where: { userId },
          orderBy: { transactionDate: "desc" },
          take: 12,
          include: { category: true, wallet: true },
        }),
        FinanceEngine.listGoals(userId).catch(() => []),
        FinanceEngine.listWallets(userId).catch(() => []),
        FinanceEngine.analyzeBudget(userId).catch(() => null),
        FinanceEngine.predictMonthEnd(userId).catch(() => null),
        prisma.aiInsight.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 3,
        }),
      ]);

    const currency = settings?.currency ?? "IDR";
    const timezone = settings?.timezone ?? "Asia/Jakarta";
    const tzTime = nowInTimezone(timezone);

    const lines: string[] = [];
    lines.push(`Timezone: ${timezone}`);
    lines.push(`Currency: ${currency}`);
    lines.push(`Current local time: ${tzTime.dayNameId}, ${tzTime.isoDate} ${tzTime.time}`);

    if (wallets.length > 0) {
      lines.push("--- SALDO REKENING (ledger, otoritatif) ---");
      for (const w of wallets) {
        lines.push(
          `- ${w.name}: ${formatAmount(w.balance, w.currency)}${w.isDefault ? " (default)" : ""}`,
        );
      }
    }

    if (budgetReport && budgetReport.budgets.length > 0) {
      lines.push(`--- BUDGET ${budgetReport.month}/${budgetReport.year} ---`);
      for (const b of budgetReport.budgets) {
        lines.push(
          `- ${b.categoryName}: ${formatAmount(b.spent, budgetReport.currency)} / ${formatAmount(b.limit, budgetReport.currency)} (${b.percentUsed}%, ${b.status})`,
        );
      }
    }

    if (prediction) {
      lines.push("--- PROYEKSI BULAN INI ---");
      lines.push(
        `Pemasukan ${formatAmount(prediction.currentIncome, currency)}, pengeluaran ${formatAmount(prediction.currentExpense, currency)} (hari ${prediction.daysElapsed}/${prediction.daysInMonth})`,
      );
      lines.push(
        `Proyeksi pengeluaran akhir bulan ${formatAmount(prediction.projectedExpense, currency)}, proyeksi arus kas bersih ${formatAmount(prediction.projectedBalance, currency)}${prediction.riskOverspend ? " — RISIKO OVERSPEND" : ""}`,
      );
    }

    if (goals.length > 0) {
      lines.push("--- TARGET KEUANGAN ---");
      for (const g of goals) {
        const target = Number(g.targetAmount);
        const current = Number(g.currentAmount);
        const pct = target > 0 ? Math.round((current / target) * 100) : 0;
        const deadline = g.deadline ? ` • tenggat ${g.deadline.toISOString().slice(0, 10)}` : "";
        lines.push(
          `- ${g.goalName}: ${formatAmount(current, currency)} / ${formatAmount(target, currency)} (${pct}%)${deadline}`,
        );
      }
    }

    if (insights.length > 0) {
      lines.push("--- INSIGHT PROAKTIF YANG SUDAH DIKIRIM (jangan diulang) ---");
      for (const i of insights) lines.push(`- ${i.title}: ${i.body}`);
    }

    const ranked = rankMemories(memories, message);
    if (ranked.length > 0) {
      lines.push("--- PREFERENSI & CATATAN ---");
      for (const m of ranked) lines.push(`- ${m.key}: ${m.content}`);
    }

    if (recentTxs.length > 0) {
      lines.push("--- TRANSAKSI TERAKHIR ---");
      for (const t of recentTxs) {
        const walletCurrency = t.wallet?.currency ?? currency;
        const amt = formatAmount(Number(t.amount), walletCurrency);
        const date = t.transactionDate.toISOString().slice(0, 10);
        lines.push(
          `${t.type === "INCOME" ? "+" : "-"} ${date} ${t.category?.name ?? "?"}: ${amt}${t.wallet ? ` @${t.wallet.name}` : ""} — ${t.description}`,
        );
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

  // Recorded here rather than at each return inside the model loop: there are a
  // dozen exit paths and a missed one would be free tokens.
  if (reply.usage) {
    await recordAiUsage({
      userId,
      source: "CHAT",
      model: reply.usage.model,
      usage: { promptTokens: reply.usage.promptTokens, outputTokens: reply.usage.outputTokens },
    });
  }

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
  // The accumulator lives out here so every early return inside the model loop
  // still reports what it spent — there are a dozen exit paths and a missed one
  // would be free tokens.
  const usage = { promptTokens: 0, outputTokens: 0, model: "" };
  const reply = await runOpenRouterInner(params, usage);
  return usage.model ? { ...reply, usage } : reply;
}

async function runOpenRouterInner(
  params: {
    userId: string;
    message: string;
    config: AiRuntimeConfig;
    channel: "TELEGRAM" | "WEB";
    history: AgentMessage[];
  },
  usage: { promptTokens: number; outputTokens: number; model: string },
): Promise<AgentReply> {
  const userContext = await loadUserContext(params.userId, params.message);
  const systemPrompt = buildFinanceAgentSystemPrompt({
    channel: params.channel,
    userContext,
  });

  const toolsUsed: string[] = [];
  const data: unknown[] = [];
  const writeReceipts: Array<{ walletName?: string; receipt: string }> = [];
  let writeAttempted = false;
  const walletPrompts: WalletPrompt[] = [];
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
    usage.model = currentModel;
    const messages: Msg[] = [
      { role: "system", content: systemPrompt },
      ...params.history.map((m) => ({ role: m.role, content: m.content }) as Msg),
      { role: "user", content: params.message },
    ];
    let forceRequiredTool = false;
    // Identical (tool, args) pairs mean the model is spinning rather than making
    // progress, and re-running a write would double-record the transaction.
    const seenCalls = new Set<string>();

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
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };

        usage.promptTokens += json.usage?.prompt_tokens ?? 0;
        usage.outputTokens += json.usage?.completion_tokens ?? 0;

        const msg = json.choices[0]?.message;
        if (!msg) throw new Error("Empty response");

        if (msg.tool_calls?.length) {
          forceRequiredTool = false;
          messages.push({ role: "assistant", content: msg.content, tool_calls: msg.tool_calls });

          const planned = msg.tool_calls.map((call) => {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(call.function.arguments || "{}"); } catch { args = {}; }
            const name = call.function.name as AgentToolName;
            const signature = `${name}:${JSON.stringify(args)}`;
            const blocked = seenCalls.has(signature)
              ? "Panggilan tool ini identik dengan yang sudah dijalankan di percakapan ini. Hasilnya tidak berubah — jangan ulangi, jawab dari hasil sebelumnya."
              : toolsUsed.length >= MAX_TOOL_CALLS
                ? "Batas jumlah tool per permintaan tercapai. Jawab sekarang dari data yang sudah ada."
                : null;
            if (!blocked) {
              seenCalls.add(signature);
              toolsUsed.push(name);
              if (isMutatingToolCall(name, args)) writeAttempted = true;
            }
            return { id: call.id, name, args: { ...args, rawInput: params.message }, blocked };
          });

          const executable = planned.filter((call) => !call.blocked);
          const executed = await executeToolsParallel(
            params.userId,
            executable.map((call) => ({ name: call.name, args: call.args })),
            params.channel,
          );
          const resultBySignature = new Map<string, unknown>();
          executable.forEach((call, index) => {
            resultBySignature.set(call.id, executed[index]?.result);
          });

          const clientMessages: string[] = [];
          let executedCount = 0;
          for (const call of planned) {
            if (call.blocked) {
              messages.push({
                role: "tool",
                tool_call_id: call.id,
                content: JSON.stringify({ error: call.blocked }),
              });
              continue;
            }
            executedCount += 1;
            const result = resultBySignature.get(call.id);
            data.push(result);
            const mutation = getVerifiedMutation(result);
            if (mutation) verifiedWrite = true;
            if (isWalletPromptResult(result)) walletPrompts.push(result.__walletPrompt);
            const clientMessage = getClientMessage(result);
            if (clientMessage) {
              clientMessages.push(clientMessage);
              if (mutation?.kind === "transaction.created") {
                writeReceipts.push({ walletName: mutation.walletName, receipt: clientMessage });
              }
            }
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
          }
          // This is a workflow state owned by the tool, not prose for the model
          // to reinterpret. Stop immediately and let the channel render the
          // exact account choices returned by the tool.
          //
          // All pending drafts are returned, not just the first: a batch like
          // "taxi 1.39, makan 6.50, rokok 1.50" produces one prompt each, and
          // dropping the rest left them as invisible rows the user could never
          // confirm. Receipts from writes that did land in the same round are
          // kept so the user sees what was already saved.
          if (walletPrompts.length > 0) {
            const saved = writeReceipts.map((write) => write.receipt);
            const heading =
              walletPrompts.length > 1
                ? `${walletPrompts.length} transaksi menunggu pilihan rekening:`
                : walletPrompts[0].question;
            return {
              text: [...saved, heading].filter(Boolean).join("\n\n"),
              toolsUsed,
              data,
              walletPrompt: walletPrompts[0],
              walletPrompts,
            };
          }
          // A pure transaction-write round already has authoritative receipts
          // from the tool. Return them directly instead of paying for another
          // model round that could paraphrase the saved facts incorrectly.
          if (
            executedCount > 0 &&
            executable.every((call) => call.name === "createTransaction") &&
            planned.length === executable.length &&
            clientMessages.length === executable.length
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

        return { text: finalText(guard(msg.content || "Selesai."), writeReceipts), toolsUsed, data, walletPrompt: walletPrompts[0], walletPrompts };
      }

      return { text: incompleteAgentReply(writeAttempted && walletPrompts.length === 0), toolsUsed, data, walletPrompt: walletPrompts[0], walletPrompts };
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
          text: incompleteAgentReply(writeAttempted && walletPrompts.length === 0),
          toolsUsed,
          data,
          walletPrompt: walletPrompts[0],
          walletPrompts,
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
