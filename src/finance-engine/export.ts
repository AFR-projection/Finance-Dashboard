import { prisma } from "@/lib/db";
import { toNumber } from "@/lib/utils";

/** RFC 4180 escaping: quotes double up, and any field with a delimiter is quoted. */
function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export type TransactionExport = {
  filename: string;
  csv: string;
  rowCount: number;
  totals: Array<{ currency: string; income: number; expense: number; net: number }>;
};

/**
 * Transactions for a date range as a spreadsheet.
 *
 * Excel on an Indonesian locale reads `,` as a decimal separator and mangles
 * comma-delimited files, so this emits semicolons and declares them with the
 * `sep=` hint. A UTF-8 BOM keeps accented descriptions readable.
 */
export async function exportTransactionsCsv(
  userId: string,
  from: Date,
  to: Date,
  label: string,
): Promise<TransactionExport> {
  const rows = await prisma.transaction.findMany({
    where: { userId, transactionDate: { gte: from, lte: to } },
    include: { category: true, wallet: true },
    orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }],
  });

  const header = [
    "Tanggal",
    "Tipe",
    "Jumlah",
    "Mata Uang",
    "Rekening",
    "Kategori",
    "Deskripsi",
    "Sumber",
  ];

  const lines = [header.map(csvCell).join(";")];
  const totals = new Map<string, { income: number; expense: number }>();

  for (const row of rows) {
    const currency = row.wallet?.currency ?? "IDR";
    const amount = toNumber(row.amount);
    const entry = totals.get(currency) ?? { income: 0, expense: 0 };
    if (row.type === "INCOME") entry.income += amount;
    else entry.expense += amount;
    totals.set(currency, entry);

    lines.push(
      [
        row.transactionDate.toISOString().slice(0, 10),
        row.type === "INCOME" ? "Masuk" : "Keluar",
        amount,
        currency,
        row.wallet?.name ?? "",
        row.category?.name ?? "",
        row.description,
        row.channel,
      ]
        .map(csvCell)
        .join(";"),
    );
  }

  const totalsList = [...totals.entries()].map(([currency, v]) => ({
    currency,
    income: v.income,
    expense: v.expense,
    net: v.income - v.expense,
  }));

  // Summary block after a blank line so the transaction table stays clean when
  // sorted or filtered in a spreadsheet.
  if (totalsList.length > 0) {
    lines.push("");
    lines.push(["RINGKASAN", "", "", "", "", "", "", ""].map(csvCell).join(";"));
    lines.push(["Mata Uang", "Masuk", "Keluar", "Selisih"].map(csvCell).join(";"));
    for (const total of totalsList) {
      lines.push([total.currency, total.income, total.expense, total.net].map(csvCell).join(";"));
    }
  }

  return {
    filename: `ledgerly-${label}.csv`,
    csv: `﻿sep=;\n${lines.join("\n")}`,
    rowCount: rows.length,
    totals: totalsList,
  };
}
