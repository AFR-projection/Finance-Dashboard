import { describe, expect, it } from "vitest";
import {
  createTransactionSchema,
  createBudgetSchema,
  createGoalSchema,
  shareSettingsSchema,
} from "./schemas";

describe("Finance Engine schemas", () => {
  it("parses Indonesian-style expense amounts", () => {
    const parsed = createTransactionSchema.parse({
      type: "EXPENSE",
      amount: 25000,
      category: "Food",
      description: "kopi",
      channel: "WEB",
    });
    expect(parsed.amount).toBe(25000);
    expect(parsed.type).toBe("EXPENSE");
  });

  it("rejects non-positive amounts", () => {
    expect(() =>
      createTransactionSchema.parse({
        type: "EXPENSE",
        amount: 0,
        description: "x",
      }),
    ).toThrow();
  });

  it("parses budgets and goals", () => {
    const budget = createBudgetSchema.parse({
      categoryId: "cjld2cjxh0000qzrmn831i7rn",
      walletId: "cjld2cyuq0000t3rmniod1foy",
      monthlyLimit: 500000,
    });
    expect(budget.monthlyLimit).toBe(500000);
    expect(budget.walletId).toBe("cjld2cyuq0000t3rmniod1foy");

    const goal = createGoalSchema.parse({
      goalName: "Dana darurat",
      walletId: "cjld2cyuq0000t3rmniod1foy",
      targetAmount: 10_000_000,
      currentAmount: 1_000_000,
    });
    expect(goal.goalName).toBe("Dana darurat");
    expect(goal.walletId).toBe("cjld2cyuq0000t3rmniod1foy");
  });

  // The wallet is what gives an amount its currency, so it cannot be optional.
  it("rejects a budget or goal with no wallet", () => {
    expect(() =>
      createBudgetSchema.parse({
        categoryId: "cjld2cjxh0000qzrmn831i7rn",
        monthlyLimit: 500000,
      }),
    ).toThrow();

    expect(() =>
      createGoalSchema.parse({ goalName: "Dana darurat", targetAmount: 10_000_000 }),
    ).toThrow();
  });

  it("defaults share to non-sensitive balance off", () => {
    const share = shareSettingsSchema.parse({
      visibility: "PUBLIC",
      showBalance: false,
      showIncome: true,
      showExpense: true,
      showCharts: true,
      showGoals: false,
    });
    expect(share.showBalance).toBe(false);
  });
});
