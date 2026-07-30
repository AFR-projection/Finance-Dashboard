export const agentTools = [
  {
    name: "createTransaction",
    description: "Create income/expense. Convert IDR: 25ribu=25000, 7juta=7000000. The tool verifies the account from the raw user message; with multiple accounts and no explicit choice it pauses instead of using a default.",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["INCOME", "EXPENSE"] },
        amount: { type: "number", description: "Positive amount" },
        category: { type: "string", description: "e.g. Food, Transport, Bills, Shopping, Health, Entertainment, Salary, Freelance" },
        description: { type: "string", description: "Short description" },
        paymentMethod: { type: "string", description: "cash/transfer/qris/card" },
        transactionDate: { type: "string", description: "YYYY-MM-DD. Omit for today — the server fills in the user's local date." },
        walletId: { type: "string", description: "Optional candidate wallet ID after manageWallet(list). The tool ignores model guesses and independently verifies the user's explicit account choice." },
      },
      required: ["type", "amount", "category", "description"],
    },
  },
  {
    name: "getCurrentTime",
    description: "Get current date/time in user's timezone. Not needed for createTransaction — only for answering time questions.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "getTransactions",
    description: "Fetch transactions with optional filters. Shows category, amount, date, wallet.",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["INCOME", "EXPENSE"] },
        search: { type: "string", description: "Search description" },
        days: { type: "number", description: "Days back (default 30)" },
        limit: { type: "number", description: "Max results (default 20)" },
        walletId: { type: "string", description: "Filter by wallet/rekening ID" },
      },
    },
  },
  {
    name: "updateTransaction",
    description: "Update a transaction. Use getTransactions first to find ID. Only include fields to change.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Transaction ID" },
        type: { type: "string", enum: ["INCOME", "EXPENSE"] },
        amount: { type: "number" },
        category: { type: "string" },
        description: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "deleteTransaction",
    description: "Delete a transaction by ID. Use getTransactions first to find the ID.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "getFinancialSnapshot",
    description: "Get the authoritative finance snapshot used for balance questions and general financial scans. Wallet balances exactly use the same all-time ledger source as the UI. Period net cash flow is explicitly separate, and currencies are never combined.",
    parameters: {
      type: "object",
      properties: { days: { type: "number", description: "Cash-flow analysis period in days (default 30). Wallet balances always remain all-time ledger balances." } },
    },
  },
  {
    name: "generateFinancialReport",
    description: "Period cash-flow report: income, expenses, net cash flow, top categories, trends, saving rate, health score, recommendations. Do not use this as an account balance.",
    parameters: {
      type: "object",
      properties: { days: { type: "number", description: "Period in days (default 30)" } },
    },
  },
  {
    name: "analyzeBudget",
    description: "Check budget status per category for a month. Shows limit, spent, remaining, and over/warning/ok status.",
    parameters: {
      type: "object",
      properties: {
        month: { type: "number", description: "1-12 (default current)" },
        year: { type: "number", description: "YYYY (default current)" },
      },
    },
  },
  {
    name: "manageBudget",
    description: "Set monthly budget limit for a category.",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", description: "Category name" },
        monthlyLimit: { type: "number", description: "Max spend for month" },
        month: { type: "number", description: "1-12" },
        year: { type: "number" },
      },
      required: ["category", "monthlyLimit"],
    },
  },
  {
    name: "manageGoal",
    description: "Create or list financial savings goals. Use action=list to show, action=create to make new.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "create"] },
        goalName: { type: "string" },
        targetAmount: { type: "number" },
        currentAmount: { type: "number", description: "Already saved (default 0)" },
        deadline: { type: "string", description: "ISO date (optional)" },
      },
      required: ["action"],
    },
  },
  {
    name: "financialCoach",
    description: "Personalized coaching: analyze spending patterns, budgets, goals, and give actionable saving/spending advice.",
    parameters: {
      type: "object",
      properties: {
        focus: { type: "string", enum: ["saving", "spending", "budget", "goals", "general"] },
      },
    },
  },
  {
    name: "predictFinances",
    description: "Predict month-end balance, projected expenses, and overspend risk based on current spending pace.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "analyzeCashflowTrend",
    description: "Multi-month income/expense trend analysis. Shows monthly breakdown, averages, and overall direction.",
    parameters: {
      type: "object",
      properties: { months: { type: "number", description: "Months to analyze (default 6)" } },
    },
  },
  {
    name: "getMonthlySummary",
    description: "Complete monthly summary: income, expense, balance, top categories, budget status.",
    parameters: {
      type: "object",
      properties: {
        month: { type: "number", description: "1-12" },
        year: { type: "number" },
      },
    },
  },
  {
    name: "comparePeriods",
    description: "Compare financial performance between two periods. Detect changes in spending, income, and category patterns.",
    parameters: {
      type: "object",
      properties: {
        period1Days: { type: "number", description: "Days for first period (default 30)" },
        period2Days: { type: "number", description: "Days for second period (default 60, going back from period1)" },
      },
    },
  },
  {
    name: "analyzeSpendingPattern",
    description: "Detect spending patterns: weekday vs weekend habits, recurring charges, category dominance, and unusual activity.",
    parameters: {
      type: "object",
      properties: { days: { type: "number", description: "Days to analyze (default 90)" } },
    },
  },
  {
    name: "detectAnomalies",
    description: "Find unusual transactions: amounts far from average, duplicate charges, unexpected categories, or frequency outliers.",
    parameters: {
      type: "object",
      properties: { days: { type: "number", description: "Days to scan (default 90)" } },
    },
  },
  {
    name: "getSavingsSuggestions",
    description: "Smart saving opportunities: identify reduction potential in each category, suggest realistic targets based on history.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "rememberFact",
    description: "Save a user preference to memory (salary day, monthly bills, preferred payment). Never store balances.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "Short key like salary_day, monthly_rent" },
        content: { type: "string", description: "The fact to remember" },
      },
      required: ["key", "content"],
    },
  },
  {
    name: "recallMemories",
    description: "Retrieve all saved user preferences, habits, and recurring financial facts from memory.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "manageWallet",
    description: "List, create, update, or deactivate financial accounts (rekening/wallet). Each wallet has its own currency — no conversion. Use action=list to resolve a wallet name or currency before passing walletId to createTransaction.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "create", "update", "delete"] },
        id: { type: "string", description: "Wallet ID — required for update/delete" },
        name: { type: "string", description: "Account name, e.g. BCA, Jenius, Cash USD" },
        currency: { type: "string", description: "ISO 4217 code: IDR, USD, SGD, etc." },
        color: { type: "string", description: "Hex color, e.g. #0F766E" },
        isDefault: { type: "boolean", description: "Set as default wallet" },
        initialBalance: {
          type: "number",
          description:
            "Opening balance, in this wallet's own currency, exactly as the user stated it. For '100$' on a USD wallet pass 100 — never convert to another currency. Only for action=create.",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "simulateScenario",
    description:
      "What-if projection from real history. Use for 'kalau X dipotong Y%, setahun jadi berapa?' or 'goal saya maju berapa lama?'. Returns estimates computed from the user's own 3-month averages — always present the result as an estimate, never as a recorded fact.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Category to adjust, e.g. Food. Omit to simulate total expenses.",
        },
        changePercent: {
          type: "number",
          description: "Spend change: -30 means cut 30%, +20 means increase 20%.",
        },
        monthlyAmount: {
          type: "number",
          description: "Absolute monthly change instead of a percentage. Negative means saving.",
        },
        horizonMonths: { type: "number", description: "Projection horizon in months (default 12)" },
        goalName: {
          type: "string",
          description: "Goal to re-time with the freed-up money. Omit to skip goal impact.",
        },
      },
    },
  },
  {
    name: "planBudgetFromHistory",
    description:
      "Propose monthly budget limits per category from the user's 3-month averages. Returns proposals only — nothing is saved. Ask the user first, then write each accepted limit with manageBudget.",
    parameters: {
      type: "object",
      properties: {
        targetSavingPercent: {
          type: "number",
          description: "How much to trim from historical averages, e.g. 10 for a 10% cut (default 10)",
        },
        months: { type: "number", description: "History window in months (default 3)" },
      },
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
