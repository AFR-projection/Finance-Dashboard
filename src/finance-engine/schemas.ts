import { z } from "zod";

export const transactionTypeSchema = z.enum(["INCOME", "EXPENSE"]);

export const createTransactionSchema = z.object({
  type: transactionTypeSchema,
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  category: z.string().min(1).max(80).optional(),
  categoryId: z.string().cuid().optional(),
  subCategory: z.string().max(80).optional().nullable(),
  description: z.string().min(1).max(500),
  paymentMethod: z.string().max(80).optional().nullable(),
  transactionDate: z.coerce.date().optional(),
  channel: z.enum(["WHATSAPP", "TELEGRAM", "WEB"]).default("WEB"),
  rawInput: z.string().max(2000).optional().nullable(),
});

export const updateTransactionSchema = createTransactionSchema.partial().extend({
  id: z.string().cuid(),
});

export const listTransactionsSchema = z.object({
  type: transactionTypeSchema.optional(),
  categoryId: z.string().cuid().optional(),
  search: z.string().max(200).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const createBudgetSchema = z.object({
  categoryId: z.string().cuid(),
  monthlyLimit: z.coerce.number().positive(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const createGoalSchema = z.object({
  goalName: z.string().min(1).max(120),
  targetAmount: z.coerce.number().positive(),
  currentAmount: z.coerce.number().min(0).default(0),
  deadline: z.coerce.date().optional().nullable(),
});

export const updateGoalSchema = createGoalSchema.partial().extend({
  id: z.string().cuid(),
});

export const aiMemorySchema = z.object({
  key: z.string().min(1).max(80),
  content: z.string().min(1).max(2000),
});

export const aiSettingsSchema = z.object({
  aiProvider: z.enum(["GEMINI", "OPENROUTER"]),
  aiModel: z.string().min(1).max(120),
  apiKey: z.string().min(10).max(500).optional(),
  currency: z.string().length(3).optional(),
  timezone: z.string().min(1).max(80).optional(),
});

export const shareSettingsSchema = z.object({
  visibility: z.enum(["PRIVATE", "PUBLIC", "SELECTED"]),
  showBalance: z.boolean(),
  showIncome: z.boolean(),
  showExpense: z.boolean(),
  showCharts: z.boolean(),
  showGoals: z.boolean(),
  displayName: z.string().max(80).optional().nullable(),
});

export const agentMessageSchema = z.object({
  message: z.string().min(1).max(4000),
  channel: z.enum(["WHATSAPP", "TELEGRAM", "WEB"]).default("WEB"),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type ListTransactionsInput = z.infer<typeof listTransactionsSchema>;
