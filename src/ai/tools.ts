export const agentTools = [
  {
    name: "createTransaction",
    description:
      "Create a validated income or expense transaction. Use for natural language spend/earn messages. Amounts in Indonesian rupiah should be full numbers (25 ribu = 25000).",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["INCOME", "EXPENSE"] },
        amount: { type: "number", description: "Positive amount in major currency units" },
        category: {
          type: "string",
          description: "Category like food, transport, bills, salary",
        },
        description: { type: "string" },
        paymentMethod: { type: "string" },
        transactionDate: {
          type: "string",
          description: "ISO date if mentioned, else omit",
        },
      },
      required: ["type", "amount", "category", "description"],
    },
  },
  {
    name: "getTransactions",
    description: "Fetch recent transactions with optional filters.",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["INCOME", "EXPENSE"] },
        search: { type: "string" },
        days: { type: "number" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "generateFinancialReport",
    description: "Generate income/expense report, top categories, trends, and recommendations.",
    parameters: {
      type: "object",
      properties: {
        days: { type: "number" },
      },
    },
  },
  {
    name: "analyzeBudget",
    description: "Analyze whether the user is over budget for the current month.",
    parameters: {
      type: "object",
      properties: {
        month: { type: "number" },
        year: { type: "number" },
      },
    },
  },
  {
    name: "financialCoach",
    description: "Provide personalized financial coaching based on current spending and goals.",
    parameters: {
      type: "object",
      properties: {
        focus: {
          type: "string",
          enum: ["saving", "spending", "budget", "goals", "general"],
        },
      },
    },
  },
  {
    name: "predictFinances",
    description: "Predict month-end balance and overspending risk.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
] as const;

export type AgentToolName = (typeof agentTools)[number]["name"];

export function toolsForOpenAICompatible() {
  return agentTools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export function toolsForGemini() {
  return agentTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}
