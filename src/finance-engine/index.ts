import {
  ChannelType,
  Prisma,
  TransactionType,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { daysAgo, endOfMonth, startOfMonth, toNumber } from "@/lib/utils";
import {
  aiMemorySchema,
  createBudgetSchema,
  createGoalSchema,
  createTransactionSchema,
  createWalletSchema,
  listTransactionsSchema,
  updateGoalSchema,
  updateWalletSchema,
  type CreateTransactionInput,
  type CreateWalletInput,
  type ListTransactionsInput,
  type UpdateWalletInput,
} from "./schemas";

const DEFAULT_CATEGORIES: Array<{
  name: string;
  icon: string;
  color: string;
  type: TransactionType;
}> = [
  { name: "Food", icon: "utensils", color: "#0F766E", type: "EXPENSE" },
  { name: "Transport", icon: "car", color: "#0369A1", type: "EXPENSE" },
  { name: "Bills", icon: "zap", color: "#B45309", type: "EXPENSE" },
  { name: "Shopping", icon: "shopping-bag", color: "#BE123C", type: "EXPENSE" },
  { name: "Health", icon: "heart", color: "#047857", type: "EXPENSE" },
  { name: "Entertainment", icon: "film", color: "#6D28D9", type: "EXPENSE" },
  { name: "Salary", icon: "wallet", color: "#15803D", type: "INCOME" },
  { name: "Freelance", icon: "briefcase", color: "#0E7490", type: "INCOME" },
  { name: "Other", icon: "circle", color: "#57534E", type: "EXPENSE" },
];

export class FinanceEngineError extends Error {
  constructor(
    message: string,
    public code: string = "FINANCE_ERROR",
    public status = 400,
  ) {
    super(message);
    this.name = "FinanceEngineError";
  }
}

function assertUser(userId: string) {
  if (!userId) throw new FinanceEngineError("Unauthorized", "UNAUTHORIZED", 401);
}

async function resolveCategoryId(
  userId: string,
  type: TransactionType,
  categoryName?: string,
  categoryId?: string,
) {
  if (categoryId) {
    const found = await prisma.category.findFirst({
      where: { id: categoryId, userId },
    });
    if (!found) throw new FinanceEngineError("Category not found", "CATEGORY_NOT_FOUND", 404);
    return found.id;
  }

  const name = (categoryName || "Other").trim();
  const existing = await prisma.category.findFirst({
    where: { userId, name: { equals: name, mode: "insensitive" }, type },
  });
  if (existing) return existing.id;

  const created = await prisma.category.create({
    data: {
      userId,
      name,
      type,
      icon: "circle",
      color: type === "INCOME" ? "#15803D" : "#57534E",
    },
  });
  return created.id;
}

export async function ensureDefaultCategories(userId: string) {
  assertUser(userId);
  const count = await prisma.category.count({ where: { userId } });
  if (count > 0) return;

  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({ ...c, userId, isDefault: true })),
  });
}

export async function ensureUserSettings(userId: string) {
  assertUser(userId);
  return prisma.userSettings.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

export async function createTransaction(userId: string, raw: CreateTransactionInput) {
  assertUser(userId);
  const input = createTransactionSchema.parse(raw);
  if (!input.walletId) {
    throw new FinanceEngineError(
      "Pilih rekening sebelum mencatat transaksi.",
      "WALLET_REQUIRED",
      409,
    );
  }
  const wallet = await prisma.wallet.findFirst({
    where: { id: input.walletId, userId, isActive: true },
  });
  if (!wallet) throw new FinanceEngineError("Wallet not found", "WALLET_NOT_FOUND", 404);
  const walletId = wallet.id;

  await ensureDefaultCategories(userId);
  const categoryId = await resolveCategoryId(
    userId,
    input.type,
    input.category,
    input.categoryId,
  );

  const tx = await prisma.transaction.create({
    data: {
      userId,
      type: input.type,
      amount: new Prisma.Decimal(input.amount),
      categoryId,
      walletId,
      subCategory: input.subCategory ?? null,
      description: input.description,
      paymentMethod: input.paymentMethod ?? null,
      transactionDate: input.transactionDate ?? new Date(),
      channel: input.channel as ChannelType,
      rawInput: input.rawInput ?? null,
    },
    include: { category: true, wallet: true },
  });

  // A successful response must be backed by a read-after-write receipt. This
  // prevents the agent from confirming a write that is not visible to later UI
  // reads from the same ledger.
  const persisted = await prisma.transaction.findFirst({
    where: { id: tx.id, userId, walletId },
    include: { category: true, wallet: true },
  });
  if (!persisted) {
    throw new FinanceEngineError(
      "Transaction write could not be verified",
      "TRANSACTION_NOT_PERSISTED",
      500,
    );
  }

  return serializeTransaction(persisted);
}

export async function updateTransaction(
  userId: string,
  id: string,
  raw: Partial<CreateTransactionInput>,
) {
  assertUser(userId);
  const existing = await prisma.transaction.findFirst({ where: { id, userId } });
  if (!existing) throw new FinanceEngineError("Transaction not found", "NOT_FOUND", 404);

  const type = (raw.type as TransactionType | undefined) ?? existing.type;
  let categoryId = existing.categoryId;
  if (raw.category || raw.categoryId || raw.type) {
    categoryId = await resolveCategoryId(userId, type, raw.category, raw.categoryId);
  }

  let walletId = existing.walletId;
  if (raw.walletId !== undefined) {
    if (raw.walletId === null) {
      walletId = null;
    } else {
      const wallet = await prisma.wallet.findFirst({ where: { id: raw.walletId, userId, isActive: true } });
      if (!wallet) throw new FinanceEngineError("Wallet not found", "WALLET_NOT_FOUND", 404);
      walletId = wallet.id;
    }
  }

  const tx = await prisma.transaction.update({
    where: { id },
    data: {
      type,
      amount: raw.amount != null ? new Prisma.Decimal(raw.amount) : undefined,
      categoryId,
      walletId,
      subCategory: raw.subCategory === undefined ? undefined : raw.subCategory,
      description: raw.description,
      paymentMethod: raw.paymentMethod === undefined ? undefined : raw.paymentMethod,
      transactionDate: raw.transactionDate,
    },
    include: { category: true, wallet: true },
  });

  return serializeTransaction(tx);
}

export async function deleteTransaction(userId: string, id: string) {
  assertUser(userId);
  const existing = await prisma.transaction.findFirst({ where: { id, userId } });
  if (!existing) throw new FinanceEngineError("Transaction not found", "NOT_FOUND", 404);
  await prisma.transaction.delete({ where: { id } });
  return { ok: true };
}

export async function getTransactions(userId: string, raw: Partial<ListTransactionsInput> = {}) {
  assertUser(userId);
  const input = listTransactionsSchema.parse(raw);

  const where: Prisma.TransactionWhereInput = {
    userId,
    type: input.type,
    categoryId: input.categoryId,
    walletId: input.walletId,
    transactionDate: {
      gte: input.from,
      lte: input.to,
    },
    ...(input.search
      ? {
          OR: [
            { description: { contains: input.search, mode: "insensitive" } },
            { subCategory: { contains: input.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { category: true, wallet: true },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
      take: input.limit,
      skip: input.offset,
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    total,
    items: items.map(serializeTransaction),
  };
}

type CurrencyBucket = {
  currency: string;
  income: number;
  expense: number;
  prevExpense: number;
  byCategory: Record<string, { name: string; amount: number; color: string }>;
};

const FALLBACK_CURRENCY = "IDR";

async function getPrimaryCurrency(userId: string): Promise<string> {
  const wallet = await prisma.wallet.findFirst({
    where: { userId, isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { currency: true },
  });
  return wallet?.currency ?? FALLBACK_CURRENCY;
}

// Transactions without a wallet are treated as primary-currency, matching getOverview.
async function primaryCurrencyWalletFilter(userId: string) {
  const currency = await getPrimaryCurrency(userId);
  const others = await prisma.wallet.findMany({
    where: { userId, currency: { not: currency } },
    select: { id: true },
  });
  return {
    currency,
    where: others.length > 0 ? { walletId: { notIn: others.map((w) => w.id) } } : {},
  };
}

function summarizeCurrency(bucket: CurrencyBucket) {
  const { income, expense, prevExpense } = bucket;
  const savingRate = income > 0 ? ((income - expense) / income) * 100 : 0;
  const expenseChangePct =
    prevExpense > 0 ? ((expense - prevExpense) / prevExpense) * 100 : expense > 0 ? 100 : 0;

  return {
    currency: bucket.currency,
    totalIncome: income,
    totalExpense: expense,
    balance: income - expense,
    savingRate: Number(savingRate.toFixed(1)),
    healthScore: computeHealthScore(income, expense, savingRate),
    expenseChangePct: Number(expenseChangePct.toFixed(1)),
    topCategories: Object.values(bucket.byCategory)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6),
  };
}

export async function getOverview(userId: string, from?: Date, to?: Date) {
  assertUser(userId);
  const rangeFrom = from ?? startOfMonth();
  const rangeTo = to ?? endOfMonth();

  const primaryCurrency = await getPrimaryCurrency(userId);

  const [txs, prev] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, transactionDate: { gte: rangeFrom, lte: rangeTo } },
      include: { category: true, wallet: true },
    }),
    (async () => {
      const prevFrom = startOfMonth(
        new Date(Date.UTC(rangeFrom.getUTCFullYear(), rangeFrom.getUTCMonth() - 1, 1)),
      );
      return prisma.transaction.findMany({
        where: {
          userId,
          transactionDate: { gte: prevFrom, lte: endOfMonth(prevFrom) },
          type: "EXPENSE",
        },
        include: { wallet: true },
      });
    })(),
  ]);

  const buckets = new Map<string, CurrencyBucket>();
  const bucketFor = (currency: string) => {
    let bucket = buckets.get(currency);
    if (!bucket) {
      bucket = { currency, income: 0, expense: 0, prevExpense: 0, byCategory: {} };
      buckets.set(currency, bucket);
    }
    return bucket;
  };
  bucketFor(primaryCurrency);

  for (const tx of txs) {
    const bucket = bucketFor(tx.wallet?.currency ?? primaryCurrency);
    const amount = toNumber(tx.amount);
    if (tx.type === "INCOME") {
      bucket.income += amount;
      continue;
    }
    bucket.expense += amount;
    const key = tx.categoryId ?? "other";
    bucket.byCategory[key] = bucket.byCategory[key] ?? {
      name: tx.category?.name ?? "Other",
      amount: 0,
      color: tx.category?.color ?? "#57534E",
    };
    bucket.byCategory[key].amount += amount;
  }

  for (const tx of prev) {
    bucketFor(tx.wallet?.currency ?? primaryCurrency).prevExpense += toNumber(tx.amount);
  }

  const byCurrency = [...buckets.values()]
    .map(summarizeCurrency)
    .sort((a, b) =>
      a.currency === primaryCurrency ? -1 : b.currency === primaryCurrency ? 1 : b.totalExpense - a.totalExpense,
    );

  // Top-level totals stay single-currency: summing across currencies without a
  // conversion rate would produce a meaningless number.
  const primary = byCurrency.find((c) => c.currency === primaryCurrency)!;

  return {
    period: { from: rangeFrom, to: rangeTo },
    currency: primaryCurrency,
    totalIncome: primary.totalIncome,
    totalExpense: primary.totalExpense,
    balance: primary.balance,
    savingRate: primary.savingRate,
    healthScore: primary.healthScore,
    expenseChangePct: primary.expenseChangePct,
    topCategories: primary.topCategories,
    byCurrency,
  };
}

function computeHealthScore(income: number, expense: number, savingRate: number): number {
  if (income <= 0 && expense <= 0) return 50;
  let score = 50;
  if (savingRate >= 30) score += 30;
  else if (savingRate >= 20) score += 22;
  else if (savingRate >= 10) score += 12;
  else if (savingRate >= 0) score += 5;
  else score -= 20;

  const burn = income > 0 ? expense / income : 1;
  if (burn < 0.6) score += 15;
  else if (burn < 0.8) score += 8;
  else if (burn > 1) score -= 25;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function generateFinancialReport(userId: string, days = 30) {
  assertUser(userId);
  const from = daysAgo(days);
  const to = new Date();
  const overview = await getOverview(userId, from, to);
  const largest = overview.topCategories[0];

  const recommendations: string[] = [];
  if (overview.savingRate < 10) {
    recommendations.push("Saving rate di bawah 10%. Coba kurangi kategori pengeluaran terbesar minggu ini.");
  } else {
    recommendations.push("Saving rate sehat. Pertimbangkan alokasi otomatis ke financial goal.");
  }
  if (largest && overview.totalExpense > 0 && largest.amount / overview.totalExpense > 0.4) {
    recommendations.push(
      `Kategori ${largest.name} mendominasi ${Math.round((largest.amount / overview.totalExpense) * 100)}% pengeluaran.`,
    );
  }
  if (overview.expenseChangePct > 20) {
    recommendations.push(`Pengeluaran naik ${overview.expenseChangePct}% dibanding periode sebelumnya.`);
  }

  return {
    ...overview,
    largestCategory: largest ?? null,
    recommendations,
    days,
  };
}

export async function analyzeBudget(userId: string, month?: number, year?: number) {
  assertUser(userId);
  const now = new Date();
  const m = month ?? now.getUTCMonth() + 1;
  const y = year ?? now.getUTCFullYear();

  const budgets = await prisma.budget.findMany({
    where: { userId, month: m, year: y },
    include: { category: true },
  });

  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = endOfMonth(from);
  const { currency, where: walletFilter } = await primaryCurrencyWalletFilter(userId);

  const results = await Promise.all(
    budgets.map(async (b) => {
      const spentAgg = await prisma.transaction.aggregate({
        where: {
          userId,
          ...walletFilter,
          type: "EXPENSE",
          categoryId: b.categoryId,
          transactionDate: { gte: from, lte: to },
        },
        _sum: { amount: true },
      });
      const spent = toNumber(spentAgg._sum.amount);
      const limit = toNumber(b.monthlyLimit);
      const pct = limit > 0 ? (spent / limit) * 100 : 0;
      return {
        id: b.id,
        categoryId: b.categoryId,
        categoryName: b.category.name,
        color: b.category.color,
        limit,
        spent,
        remaining: limit - spent,
        percentUsed: Number(pct.toFixed(1)),
        status: pct >= 100 ? "over" : pct >= 80 ? "warning" : "ok",
      };
    }),
  );

  return { month: m, year: y, currency, budgets: results };
}

export async function upsertBudget(userId: string, raw: unknown) {
  assertUser(userId);
  const input = createBudgetSchema.parse(raw);
  const now = new Date();
  const month = input.month ?? now.getMonth() + 1;
  const year = input.year ?? now.getFullYear();

  return prisma.budget.upsert({
    where: {
      userId_categoryId_month_year: {
        userId,
        categoryId: input.categoryId,
        month,
        year,
      },
    },
    update: { monthlyLimit: new Prisma.Decimal(input.monthlyLimit) },
    create: {
      userId,
      categoryId: input.categoryId,
      monthlyLimit: new Prisma.Decimal(input.monthlyLimit),
      month,
      year,
    },
    include: { category: true },
  });
}

export async function createGoal(userId: string, raw: unknown) {
  assertUser(userId);
  const input = createGoalSchema.parse(raw);
  return prisma.financialGoal.create({
    data: {
      userId,
      goalName: input.goalName,
      targetAmount: new Prisma.Decimal(input.targetAmount),
      currentAmount: new Prisma.Decimal(input.currentAmount),
      deadline: input.deadline ?? null,
    },
  });
}

export async function listGoals(userId: string) {
  assertUser(userId);
  return prisma.financialGoal.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateGoal(userId: string, raw: unknown) {
  assertUser(userId);
  const input = updateGoalSchema.parse(raw);
  const existing = await prisma.financialGoal.findFirst({
    where: { id: input.id, userId },
  });
  if (!existing) throw new FinanceEngineError("Goal not found", "GOAL_NOT_FOUND", 404);

  const { id, ...data } = input;
  return prisma.financialGoal.update({
    where: { id },
    data: {
      ...(data.goalName !== undefined ? { goalName: data.goalName } : {}),
      ...(data.targetAmount !== undefined
        ? { targetAmount: new Prisma.Decimal(data.targetAmount) }
        : {}),
      ...(data.currentAmount !== undefined
        ? { currentAmount: new Prisma.Decimal(data.currentAmount) }
        : {}),
      ...(data.deadline !== undefined ? { deadline: data.deadline } : {}),
    },
  });
}

export async function deleteGoal(userId: string, id: string) {
  assertUser(userId);
  const existing = await prisma.financialGoal.findFirst({ where: { id, userId } });
  if (!existing) throw new FinanceEngineError("Goal not found", "GOAL_NOT_FOUND", 404);
  await prisma.financialGoal.delete({ where: { id } });
  return { id };
}

/** Preference / habit memory only — never store balances or raw transactions. */
export async function upsertAiMemory(userId: string, raw: unknown) {
  assertUser(userId);
  const input = aiMemorySchema.parse(raw);
  return prisma.aiMemory.upsert({
    where: { userId_key: { userId, key: input.key } },
    update: { content: input.content },
    create: { userId, key: input.key, content: input.content },
  });
}

export async function listAiMemories(userId: string) {
  assertUser(userId);
  return prisma.aiMemory.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
}

export async function saveAiInsights(
  userId: string,
  periodKey: string,
  insights: Array<{ title: string; body: string; severity?: string }>,
) {
  assertUser(userId);
  await prisma.aiInsight.deleteMany({ where: { userId, periodKey } });
  if (insights.length === 0) return [];
  await prisma.aiInsight.createMany({
    data: insights.map((i) => ({
      userId,
      periodKey,
      title: i.title,
      body: i.body,
      severity: i.severity ?? "info",
    })),
  });
  return prisma.aiInsight.findMany({
    where: { userId, periodKey },
    orderBy: { createdAt: "desc" },
  });
}

export async function listAiInsights(userId: string, periodKey?: string) {
  assertUser(userId);
  return prisma.aiInsight.findMany({
    where: { userId, ...(periodKey ? { periodKey } : {}) },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
}

export async function getCashflowSeries(userId: string, months = 6) {
  assertUser(userId);
  const series: Array<{ label: string; income: number; expense: number }> = [];
  const now = new Date();
  const { currency, where: walletFilter } = await primaryCurrencyWalletFilter(userId);

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const from = startOfMonth(d);
    const to = endOfMonth(d);
    const txs = await prisma.transaction.findMany({
      where: { userId, ...walletFilter, transactionDate: { gte: from, lte: to } },
    });
    let income = 0;
    let expense = 0;
    for (const tx of txs) {
      const amount = toNumber(tx.amount);
      if (tx.type === "INCOME") income += amount;
      else expense += amount;
    }
    series.push({
      label: from.toLocaleDateString("id-ID", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }),
      income,
      expense,
    });
  }

  return { currency, series };
}

export async function predictMonthEnd(userId: string) {
  assertUser(userId);
  const now = new Date();
  const from = startOfMonth(now);
  const overview = await getOverview(userId, from, endOfMonth(now));
  const day = now.getUTCDate();
  const daysInMonth = endOfMonth(now).getUTCDate();
  const dailyBurn = day > 0 ? overview.totalExpense / day : 0;
  const projectedExpense = dailyBurn * daysInMonth;
  const projectedBalance = overview.totalIncome - projectedExpense;

  return {
    currentExpense: overview.totalExpense,
    currentIncome: overview.totalIncome,
    projectedExpense: Math.round(projectedExpense),
    projectedBalance: Math.round(projectedBalance),
    riskOverspend: projectedExpense > overview.totalIncome,
    daysElapsed: day,
    daysInMonth,
  };
}

export async function createWallet(userId: string, raw: CreateWalletInput) {
  assertUser(userId);
  const input = createWalletSchema.parse(raw);

  if (input.isDefault) {
    await prisma.wallet.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
  }

  const wallet = await prisma.wallet.create({
    data: { userId, name: input.name, currency: input.currency, color: input.color ?? null, isDefault: input.isDefault ?? false },
  });

  // Balances are derived from transactions, so an opening balance has to be one.
  // Recorded here rather than by the caller so the amount stays in the wallet's
  // own currency and never passes through a conversion.
  if (input.initialBalance && input.initialBalance > 0) {
    await prisma.transaction.create({
      data: {
        userId,
        walletId: wallet.id,
        type: "INCOME",
        amount: new Prisma.Decimal(input.initialBalance),
        description: `Saldo awal ${wallet.name}`,
        transactionDate: new Date(),
      },
    });
  }

  return wallet;
}

export async function listWallets(userId: string) {
  assertUser(userId);
  const wallets = await prisma.wallet.findMany({
    where: { userId, isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  return Promise.all(
    wallets.map(async (w) => {
      const agg = await prisma.transaction.groupBy({
        by: ["type"],
        where: { userId, walletId: w.id },
        _sum: { amount: true },
      });
      const income = toNumber(agg.find((r) => r.type === "INCOME")?._sum.amount ?? 0);
      const expense = toNumber(agg.find((r) => r.type === "EXPENSE")?._sum.amount ?? 0);
      return { id: w.id, name: w.name, currency: w.currency, color: w.color, isDefault: w.isDefault, isActive: w.isActive, balance: income - expense, createdAt: w.createdAt };
    }),
  );
}

type WalletBalance = Awaited<ReturnType<typeof listWallets>>[number];

export function groupWalletBalancesByCurrency(wallets: WalletBalance[]) {
  const totals = new Map<string, { currency: string; totalBalance: number; walletCount: number }>();
  for (const wallet of wallets) {
    const current = totals.get(wallet.currency) ?? {
      currency: wallet.currency,
      totalBalance: 0,
      walletCount: 0,
    };
    current.totalBalance += wallet.balance;
    current.walletCount += 1;
    totals.set(wallet.currency, current);
  }
  return [...totals.values()];
}

/** Exact ledger snapshot shared with the dashboard's wallet balance source. */
export async function getFinancialSnapshot(userId: string, days = 30) {
  assertUser(userId);
  const safeDays = Math.max(1, Math.min(365, Math.round(days || 30)));
  const to = new Date();
  const from = daysAgo(safeDays);
  const [wallets, overview] = await Promise.all([
    listWallets(userId),
    getOverview(userId, from, to),
  ]);

  const assetsByCurrency = groupWalletBalancesByCurrency(wallets).sort((a, b) =>
    a.currency === overview.currency
      ? -1
      : b.currency === overview.currency
        ? 1
        : a.currency.localeCompare(b.currency),
  );
  const cashflowByCurrency = overview.byCurrency.map(({ balance, ...item }) => ({
    ...item,
    netCashflow: balance,
  }));

  return {
    generatedAt: to,
    period: { from, to, days: safeDays },
    primaryCurrency: overview.currency,
    wallets,
    assetsByCurrency,
    cashflow: {
      totalIncome: overview.totalIncome,
      totalExpense: overview.totalExpense,
      netCashflow: overview.balance,
      savingRate: overview.savingRate,
      healthScore: overview.healthScore,
      expenseChangePct: overview.expenseChangePct,
      topCategories: overview.topCategories,
      byCurrency: cashflowByCurrency,
    },
    terminology: {
      walletBalance: "Saldo ledger sepanjang waktu yang sama dengan nilai rekening di UI.",
      netCashflow: "Pemasukan dikurangi pengeluaran hanya untuk periode snapshot; bukan saldo rekening.",
    },
  };
}

export async function updateWallet(userId: string, raw: UpdateWalletInput) {
  assertUser(userId);
  const input = updateWalletSchema.parse(raw);
  const existing = await prisma.wallet.findFirst({ where: { id: input.id, userId } });
  if (!existing) throw new FinanceEngineError("Wallet not found", "WALLET_NOT_FOUND", 404);

  if (input.isDefault) {
    await prisma.wallet.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
  }

  const { id, ...data } = input;
  return prisma.wallet.update({ where: { id }, data });
}

export async function deleteWallet(userId: string, id: string) {
  assertUser(userId);
  const existing = await prisma.wallet.findFirst({ where: { id, userId } });
  if (!existing) throw new FinanceEngineError("Wallet not found", "WALLET_NOT_FOUND", 404);
  await prisma.wallet.update({ where: { id }, data: { isActive: false } });
  return { id };
}

function serializeTransaction(
  tx: Prisma.TransactionGetPayload<{ include: { category: true; wallet: true } }>,
) {
  return {
    id: tx.id,
    type: tx.type,
    amount: toNumber(tx.amount),
    categoryId: tx.categoryId,
    category: tx.category
      ? { id: tx.category.id, name: tx.category.name, color: tx.category.color, icon: tx.category.icon }
      : null,
    walletId: tx.walletId,
    wallet: tx.wallet
      ? { id: tx.wallet.id, name: tx.wallet.name, currency: tx.wallet.currency, color: tx.wallet.color }
      : null,
    subCategory: tx.subCategory,
    description: tx.description,
    paymentMethod: tx.paymentMethod,
    transactionDate: tx.transactionDate,
    channel: tx.channel,
    createdAt: tx.createdAt,
  };
}

export const FinanceEngine = {
  ensureDefaultCategories,
  ensureUserSettings,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getTransactions,
  getOverview,
  generateFinancialReport,
  analyzeBudget,
  upsertBudget,
  createGoal,
  updateGoal,
  deleteGoal,
  listGoals,
  upsertAiMemory,
  listAiMemories,
  saveAiInsights,
  listAiInsights,
  getCashflowSeries,
  predictMonthEnd,
  createWallet,
  listWallets,
  getFinancialSnapshot,
  updateWallet,
  deleteWallet,
};
