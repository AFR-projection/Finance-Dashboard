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
import type { ChatPlan } from "./graph/compile";
import { loadChatPlan } from "./graph/store";
import type { AgentNodeKind } from "./graph/types";
import { emitAgentEvent, newRunId } from "@/lib/agent-telemetry";

/**
 * Pelapor jalannya satu run ke kanvas Agent Studio.
 *
 * Sengaja tidak async dan tidak pernah melempar: telemetri tidak boleh punya
 * suara dalam nasib sebuah pesan yang mencatat uang. Node yang tidak ada di
 * graph (mis. sudah dihapus admin) dilewati diam-diam — kanvas tidak punya
 * kotak untuk menyalakannya.
 */
type RunTracer = {
  node: (
    kind: AgentNodeKind,
    status: "running" | "ok" | "skipped" | "error",
    detail?: string,
    ms?: number,
  ) => void;
  end: (status: "ok" | "error", toolsUsed: string[]) => void;
};

function createChatTracer(plan: ChatPlan, channel: string): RunTracer {
  const runId = newRunId();
  const startedAt = Date.now();
  emitAgentEvent({
    type: "run:start",
    runId,
    track: "chat",
    channel,
    at: new Date().toISOString(),
  });

  return {
    node(kind, status, detail, ms) {
      const nodeId = plan.nodeIds[kind];
      if (!nodeId) return;
      emitAgentEvent({
        type: "node",
        runId,
        nodeId,
        kind,
        status,
        ms,
        detail,
        at: new Date().toISOString(),
      });
    },
    end(status, toolsUsed) {
      emitAgentEvent({
        type: "run:end",
        runId,
        status,
        ms: Date.now() - startedAt,
        toolsUsed,
        at: new Date().toISOString(),
      });
    },
  };
}

/**
 * Dipakai saat node "Konteks Keuangan" dimatikan atau dihapus dari kanvas.
 *
 * Model tetap dapat timezone dan mata uang — tanpa itu setiap angka yang ia
 * tulis jadi ambigu — tapi tidak satu pun blok data keuangan ikut.
 */
const CONTEXT_ALL_OFF: NonNullable<ChatPlan["context"]> = {
  wallets: false,
  budget: false,
  prediction: false,
  goals: false,
  insights: false,
  memories: false,
  recentTransactions: false,
  memoryLimit: 0,
  transactionLimit: 0,
  insightLimit: 0,
};

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

/**
 * Batas putaran dan batas panggilan tool sekarang datang dari node "Penalaran
 * LLM" dan "Eksekutor Tool" di Agent Studio. Nilai bawaannya (6 dan 30) hidup
 * di src/ai/graph/catalogue.ts, dan graph.test.ts menjaga agar tetap sama
 * dengan yang dulu di-hardcode di sini.
 *
 * Batas panggilan tool tetap ada karena satu alasan: model yang berputar bisa
 * membakar biaya tanpa henti. Ukurannya pas untuk satu batch dikte belanja
 * sehari — memotong ekornya diam-diam lebih buruk daripada token tambahannya.
 */
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

/**
 * Merangkai konteks keuangan sesuai node "Konteks Keuangan" di Agent Studio.
 *
 * Tiap blok diambil hanya kalau dinyalakan. Ini bukan sekadar memotong prompt:
 * masing-masing blok adalah satu query, jadi mematikan yang tidak terpakai
 * benar-benar mengurangi beban per pesan.
 */
async function loadUserContext(
  userId: string,
  message: string,
  ctx: NonNullable<ChatPlan["context"]>,
): Promise<string> {
  try {
    const [memories, settings, recentTxs, goals, wallets, budgetReport, prediction, insights] =
      await Promise.all([
        ctx.memories && ctx.memoryLimit > 0
          ? prisma.aiMemory.findMany({
              where: { userId },
              orderBy: { updatedAt: "desc" },
              take: ctx.memoryLimit,
            })
          : [],
        // Selalu dibaca: timezone dan mata uang menentukan cara setiap angka
        // lain ditulis, jadi ini bukan blok yang bisa dimatikan.
        prisma.userSettings.findUnique({ where: { userId } }),
        ctx.recentTransactions && ctx.transactionLimit > 0
          ? prisma.transaction.findMany({
              where: { userId },
              orderBy: { transactionDate: "desc" },
              take: ctx.transactionLimit,
              include: { category: true, wallet: true },
            })
          : [],
        ctx.goals ? FinanceEngine.listGoals(userId).catch(() => []) : [],
        ctx.wallets ? FinanceEngine.listWallets(userId).catch(() => []) : [],
        ctx.budget ? FinanceEngine.analyzeBudget(userId).catch(() => null) : null,
        ctx.prediction ? FinanceEngine.predictMonthEnd(userId).catch(() => null) : null,
        ctx.insights && ctx.insightLimit > 0
          ? prisma.aiInsight.findMany({
              where: { userId },
              orderBy: { createdAt: "desc" },
              take: ctx.insightLimit,
            })
          : [],
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
  /** Disuntikkan oleh dry-run Agent Studio agar draft bisa diuji sebelum dipublish. */
  plan?: ChatPlan;
}): Promise<AgentReply> {
  const { userId, message, config, channel = "WEB" } = params;
  if (!config.apiKey) {
    return {
      text: "API key AI belum dikonfigurasi. Buka Settings > AI Provider.",
      toolsUsed: [],
    };
  }

  const plan = params.plan ?? (await loadChatPlan());
  const trace = createChatTracer(plan, channel);

  // Kanal yang dimatikan di node pemicu ditolak di sini, sebelum satu token pun
  // dibelanjakan.
  if (!plan.channels.includes(channel)) {
    trace.node("trigger.chat", "skipped", `kanal ${channel} tidak dilayani`);
    trace.end("ok", []);
    return {
      text: "Agent sedang tidak melayani kanal ini. Coba lewat kanal lain atau hubungi admin.",
      toolsUsed: [],
    };
  }
  trace.node("trigger.chat", "ok", channel);

  const historyStartedAt = Date.now();
  const history = plan.conversation
    ? await loadHistory(userId, channel, plan.conversation)
    : [];
  trace.node(
    "memory.conversation",
    plan.conversation ? "ok" : "skipped",
    plan.conversation ? `${history.length} pesan` : undefined,
    Date.now() - historyStartedAt,
  );

  const reply = await runOpenRouter({ userId, message, config, channel, history, plan, trace });

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

  if (plan.conversation) {
    await appendHistory(
      userId,
      channel,
      [
        { role: "user", content: message },
        { role: "assistant", content: reply.text },
      ],
      plan.conversation,
    );
  }

  trace.node("dispatch.reply", "ok", `${reply.text.length} karakter`);
  trace.end("ok", reply.toolsUsed);
  return reply;
}

async function runOpenRouter(params: {
  userId: string;
  message: string;
  config: AiRuntimeConfig;
  channel: "TELEGRAM" | "WEB";
  history: AgentMessage[];
  plan: ChatPlan;
  trace: RunTracer;
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
    plan: ChatPlan;
    trace: RunTracer;
  },
  usage: { promptTokens: number; outputTokens: number; model: string },
): Promise<AgentReply> {
  const { plan, trace } = params;
  const contextStartedAt = Date.now();
  const userContext = await loadUserContext(
    params.userId,
    params.message,
    plan.context ?? CONTEXT_ALL_OFF,
  );
  trace.node(
    "context.loader",
    plan.context ? "ok" : "skipped",
    undefined,
    Date.now() - contextStartedAt,
  );
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

  // Node "Kebijakan Intent" dimatikan berarti tidak ada tool yang diwajibkan:
  // model bebas menjawab tanpa dipaksa membaca data lebih dulu.
  const intent = classifyDeterministicIntent(params.message);
  const requiredTool = plan.intent ? requiredToolForIntent(intent) : undefined;
  // A read can be forced safely; forcing a write would let a misread intent
  // create a transaction the user never asked for. Writes are only nudged, and
  // a false "tercatat" claim is caught by the guard below instead.
  const forceableTool =
    plan.intent?.forceReadTool && requiredTool === "getFinancialSnapshot"
      ? requiredTool
      : undefined;
  trace.node("policy.intent", plan.intent ? "ok" : "skipped", intent ?? "tanpa intent khusus");

  // The model's prose is never proof. Every reply that reaches the user is
  // filtered against what the tools actually returned this turn.
  //
  // Tiap saringan dipasang terpisah sesuai node "Guard Kebenaran": mematikan
  // salah satunya di kanvas benar-benar melepas saringan itu, bukan sekadar
  // mengubah tampilan.
  const guard = (text: string): string => {
    let result = text;
    if (plan.guard?.enforceWriteClaim) {
      result = enforceWriteClaim({
        text: result,
        hasVerifiedWrite: verifiedWrite,
        writeIntended: writeAttempted || intent === "CREATE_TRANSACTION",
      });
    }
    if (plan.guard?.enforceGroundedFigures) {
      result = enforceGroundedFigures({
        text: result,
        intent,
        ranRequiredRead: toolsUsed.some((name) => GROUNDING_READ_TOOLS.has(name)),
      });
    }
    // Guard yang mengganti teks adalah guard yang bekerja, bukan kegagalan run —
    // jadi ini dilaporkan sebagai "ok" dengan keterangan, bukan "error".
    trace.node(
      "guard.grounding",
      plan.guard ? "ok" : "skipped",
      plan.guard ? (result === text ? "lolos" : "balasan disaring") : undefined,
    );
    return result;
  };

  // Tool yang dimatikan tidak pernah dikirim ke model, jadi mustahil dipanggil.
  const activeTools = plan.tools
    ? toolsForOpenAICompatible().filter((tool) => plan.tools!.enabled.includes(tool.function.name))
    : [];
  const maxRounds = Math.max(1, Math.round(plan.llm.maxRounds));
  const maxToolCalls = plan.tools ? Math.max(1, Math.round(plan.tools.maxToolCalls)) : 0;

  type Msg = {
    role: "system" | "user" | "assistant" | "tool";
    content: string | null;
    tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
    tool_call_id?: string;
  };

  const { primary, fallbacks } = buildModelChain(params.config, plan);
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
      for (let round = 0; round < maxRounds; round++) {
        const roundStartedAt = Date.now();
        trace.node("llm.reasoner", "running", `putaran ${round + 1}/${maxRounds}`);
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
            // Kunci tools dihilangkan sama sekali kalau tidak ada tool aktif —
            // array kosong ditolak sebagian penyedia.
            ...(activeTools.length > 0
              ? {
                  tools: activeTools,
                  tool_choice:
                    forceRequiredTool && forceableTool
                      ? { type: "function", function: { name: forceableTool } }
                      : "auto",
                }
              : {}),
            temperature: plan.llm.temperature,
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
        trace.node("llm.reasoner", "ok", currentModel, Date.now() - roundStartedAt);

        if (msg.tool_calls?.length) {
          forceRequiredTool = false;
          messages.push({ role: "assistant", content: msg.content, tool_calls: msg.tool_calls });

          const planned = msg.tool_calls.map((call) => {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(call.function.arguments || "{}"); } catch { args = {}; }
            const name = call.function.name as AgentToolName;
            const signature = `${name}:${JSON.stringify(args)}`;
            const duplicate = plan.tools?.dedupeIdenticalCalls === true && seenCalls.has(signature);
            // Tool yang dimatikan di kanvas tidak pernah dikirim ke model, tapi
            // model yang mengarang nama tool tetap harus ditolak di sini.
            const disabled = !plan.tools || !plan.tools.enabled.includes(name);
            const blocked = duplicate
              ? "Panggilan tool ini identik dengan yang sudah dijalankan di percakapan ini. Hasilnya tidak berubah — jangan ulangi, jawab dari hasil sebelumnya."
              : disabled
                ? "Tool ini sedang dinonaktifkan oleh admin. Jawab dari data yang sudah ada."
                : toolsUsed.length >= maxToolCalls
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
          const toolsStartedAt = Date.now();
          trace.node(
            "tools.executor",
            "running",
            executable.map((call) => call.name).join(", ") || "semua ditolak",
          );
          const executed = await executeToolsParallel(
            params.userId,
            executable.map((call) => ({ name: call.name, args: call.args })),
            params.channel,
          );
          const resultBySignature = new Map<string, unknown>();
          executable.forEach((call, index) => {
            resultBySignature.set(call.id, executed[index]?.result);
          });
          const blockedCount = planned.length - executable.length;
          trace.node(
            "tools.executor",
            "ok",
            blockedCount > 0
              ? `${executable.length} jalan, ${blockedCount} ditolak`
              : `${executable.length} tool`,
            Date.now() - toolsStartedAt,
          );

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
        if (requiredTool && !toolsUsed.includes(requiredTool) && round < maxRounds - 1) {
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
      trace.node("llm.reasoner", "error", lastError.slice(0, 120));
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

/**
 * Model utama & cadangan tetap milik konfigurasi platform (/ai).
 *
 * Node LLM hanya boleh MENIMPA-nya, bukan menduplikasi: kalau daftar model ada
 * di dua tempat, cepat atau lambat keduanya berbeda dan tidak ada yang tahu
 * mana yang sebenarnya dipakai.
 */
function buildModelChain(
  config: AiRuntimeConfig,
  plan: ChatPlan,
): { primary: string; fallbacks: string[] } {
  const primary = plan.llm.modelOverride || config.model || "openai/gpt-4o-mini";
  if (!plan.llm.useFallbackModels) return { primary, fallbacks: [] };
  const fallbacks = (config.fallbackModels ?? []).filter((m) => m && m !== primary).slice(0, 2);
  return { primary, fallbacks };
}
