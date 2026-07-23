import { FinanceEngine } from "@/finance-engine";
import { jsonOk, withApiGuard } from "@/lib/api";

function periodKeyNow() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  return withApiGuard(request, async (userId) => {
    const key = periodKeyNow();
    let stored = await FinanceEngine.listAiInsights(userId, key);

    if (stored.length === 0) {
      const overview = await FinanceEngine.getOverview(userId);
      const prediction = await FinanceEngine.predictMonthEnd(userId);
      const generated: Array<{ title: string; body: string; severity?: string }> = [];

      if (overview.expenseChangePct > 10) {
        generated.push({
          title: "Pengeluaran naik",
          body: `Pengeluaran naik ${overview.expenseChangePct}% dibanding bulan lalu.`,
          severity: "warning",
        });
      } else if (overview.expenseChangePct < -10) {
        generated.push({
          title: "Berhasil hemat",
          body: `Kamu berhasil menghemat ${Math.abs(overview.expenseChangePct)}% dibanding bulan lalu.`,
          severity: "success",
        });
      }

      if (overview.topCategories?.[0]) {
        generated.push({
          title: "Kategori terbesar",
          body: `Kategori terbesar bulan ini: ${overview.topCategories[0].name}.`,
        });
      }

      generated.push({
        title: "Saving rate",
        body:
          overview.savingRate >= 20
            ? `Saving rate ${overview.savingRate}% — di atas target sehat 20%.`
            : `Saving rate ${overview.savingRate}%. Targetkan minimal 20% bulan ini.`,
        severity: overview.savingRate >= 20 ? "success" : "info",
      });

      if (prediction.riskOverspend) {
        generated.push({
          title: "Risiko overspend",
          body: `Proyeksi akhir bulan menunjukkan risiko overspend. Estimasi expense ${prediction.projectedExpense.toLocaleString("id-ID")}.`,
          severity: "warning",
        });
      } else {
        generated.push({
          title: "Proyeksi saldo",
          body: `Estimasi saldo akhir bulan sekitar ${prediction.projectedBalance.toLocaleString("id-ID")}.`,
        });
      }

      stored = await FinanceEngine.saveAiInsights(userId, key, generated);
    }

    return jsonOk({
      periodKey: key,
      items: stored.map((i) => ({
        id: i.id,
        title: i.title,
        body: i.body,
        severity: i.severity,
        createdAt: i.createdAt,
      })),
    });
  });
}
