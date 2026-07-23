import { GoogleGenerativeAI } from "@google/generative-ai";
import { toolsForGemini, toolsForOpenAICompatible } from "./tools";
import { executeTool } from "./tool-executor";

export type AiRuntimeConfig = {
  provider: "GEMINI" | "OPENROUTER";
  model: string;
  apiKey: string;
};

export type AgentReply = {
  text: string;
  toolsUsed: string[];
  data?: unknown[];
};

const SYSTEM_PROMPT = `You are AI Finance Agent, a reliable personal finance assistant for Indonesian users.
Rules:
- Understand Bahasa Indonesia and English.
- Convert phrases like "25 ribu" to 25000, "7 juta" to 7000000.
- Never invent balances. Always use tools for create/read/analyze.
- After tools run, reply briefly and clearly with confirmed numbers.
- For coaching, be practical and non-judgmental.
- Currency default is IDR unless user settings say otherwise.
- If the user asks something unrelated to finance, politely redirect.`;

export async function runFinanceAgent(params: {
  userId: string;
  message: string;
  config: AiRuntimeConfig;
  channel?: "WHATSAPP" | "TELEGRAM" | "WEB";
}): Promise<AgentReply> {
  const { userId, message, config, channel = "WEB" } = params;
  if (!config.apiKey) {
    return {
      text: "API key AI belum dikonfigurasi. Buka Settings → AI Provider untuk menambahkan key.",
      toolsUsed: [],
    };
  }

  if (config.provider === "GEMINI") {
    return runGemini({ userId, message, config, channel });
  }
  return runOpenRouter({ userId, message, config, channel });
}

async function runGemini(params: {
  userId: string;
  message: string;
  config: AiRuntimeConfig;
  channel: "WHATSAPP" | "TELEGRAM" | "WEB";
}): Promise<AgentReply> {
  const genAI = new GoogleGenerativeAI(params.config.apiKey);
  const model = genAI.getGenerativeModel({
    model: params.config.model || "gemini-2.0-flash",
    systemInstruction: SYSTEM_PROMPT,
    tools: [{ functionDeclarations: toolsForGemini() as never }],
  });

  const chat = model.startChat();
  const result = await chat.sendMessage(params.message);
  const toolsUsed: string[] = [];
  const data: unknown[] = [];

  const candidate = result.response.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const functionCalls = parts.filter((p) => "functionCall" in p && p.functionCall);

  if (functionCalls.length > 0) {
    const responseParts = [];
    for (const part of functionCalls) {
      const fc = (part as { functionCall: { name: string; args: Record<string, unknown> } })
        .functionCall;
      toolsUsed.push(fc.name);
      const toolResult = await executeTool(params.userId, fc.name, {
        ...fc.args,
        rawInput: params.message,
      }, params.channel);
      data.push(toolResult);
      responseParts.push({
        functionResponse: {
          name: fc.name,
          response: { result: toolResult },
        },
      });
    }

    const followUp = await chat.sendMessage(responseParts);
    return {
      text: followUp.response.text() || "Selesai diproses.",
      toolsUsed,
      data,
    };
  }

  return {
    text: result.response.text() || "Saya siap membantu keuangan Anda.",
    toolsUsed,
    data,
  };
}

async function runOpenRouter(params: {
  userId: string;
  message: string;
  config: AiRuntimeConfig;
  channel: "WHATSAPP" | "TELEGRAM" | "WEB";
}): Promise<AgentReply> {
  const toolsUsed: string[] = [];
  const data: unknown[] = [];

  type Msg = {
    role: "system" | "user" | "assistant" | "tool";
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
    tool_call_id?: string;
  };

  const messages: Msg[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: params.message },
  ];

  for (let round = 0; round < 3; round++) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.config.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "AI Finance Agent",
      },
      body: JSON.stringify({
        model: params.config.model || "openai/gpt-4o-mini",
        messages,
        tools: toolsForOpenAICompatible(),
        tool_choice: "auto",
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter error: ${res.status} ${errText}`);
    }

    const json = (await res.json()) as {
      choices: Array<{
        message: Msg & {
          tool_calls?: Array<{
            id: string;
            type: "function";
            function: { name: string; arguments: string };
          }>;
        };
      }>;
    };

    const msg = json.choices[0]?.message;
    if (!msg) throw new Error("Empty OpenRouter response");

    if (msg.tool_calls?.length) {
      messages.push({
        role: "assistant",
        content: msg.content,
        tool_calls: msg.tool_calls,
      });

      for (const call of msg.tool_calls) {
        toolsUsed.push(call.function.name);
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
        } catch {
          args = {};
        }
        const toolResult = await executeTool(
          params.userId,
          call.function.name,
          { ...args, rawInput: params.message },
          params.channel,
        );
        data.push(toolResult);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(toolResult),
        });
      }
      continue;
    }

    return {
      text: msg.content || "Selesai diproses.",
      toolsUsed,
      data,
    };
  }

  return {
    text: "Permintaan terlalu kompleks. Coba pecah menjadi beberapa pesan.",
    toolsUsed,
    data,
  };
}
