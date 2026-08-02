import { AiCostPanels, type RecentCall } from "@/components/admin/ai-cost-panels";
import { ConfigForm } from "@/components/admin/config-form";
import { PageHeader, Panel, PanelHeader } from "@/components/admin/ui";
import { BrainCircuit } from "lucide-react";
import { currentPeriodKey } from "@/ai/usage";
import { readAdminPulse } from "@/lib/admin-metrics";
import { getAppConfigRaw } from "@/lib/app-config";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminAiPage() {
  const monthAgo = new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000);

  const [cfg, pulse, modelRows, spenderRows, recentRows] = await Promise.all([
    getAppConfigRaw(),
    readAdminPulse(),
    prisma.aiUsageLog.groupBy({
      by: ["model"],
      where: { createdAt: { gte: monthAgo } },
      _sum: { promptTokens: true, outputTokens: true },
      _count: { _all: true },
    }),
    prisma.aiUsageMonthly.findMany({
      where: { periodKey: currentPeriodKey(), source: "CHAT" },
      orderBy: { tokens: "desc" },
      take: 8,
      include: { user: { select: { username: true, name: true } } },
    }),
    prisma.aiUsageLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        model: true,
        source: true,
        promptTokens: true,
        outputTokens: true,
        createdAt: true,
        user: { select: { username: true, name: true } },
      },
    }),
  ]);

  const models = modelRows
    .map((row) => ({
      model: row.model,
      tokens: (row._sum.promptTokens ?? 0) + (row._sum.outputTokens ?? 0),
      requests: row._count._all,
    }))
    .sort((a, b) => b.tokens - a.tokens);

  const spenders = spenderRows.map((row) => ({
    userId: row.userId,
    label: row.user.username ? `@${row.user.username}` : row.user.name || "—",
    tokens: row.tokens,
  }));

  const recent: RecentCall[] = recentRows.map((row) => ({
    id: row.id,
    model: row.model,
    source: row.source,
    tokens: row.promptTokens + row.outputTokens,
    user: row.user.username ? `@${row.user.username}` : row.user.name || "—",
    at: row.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="AI & Model"
        description="Key dan model berlaku untuk semua pengguna. Pengguna tidak bisa memilih modelnya sendiri."
      />

      <AiCostPanels
        initialPulse={pulse}
        models={models}
        spenders={spenders}
        recent={recent}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="lg:col-span-1">
          <PanelHeader
            title="Kredensial OpenRouter"
            hint="Kunci disimpan terenkripsi dan tidak pernah ditampilkan kembali"
            icon={BrainCircuit}
          />
          <div className="p-5">
            <ConfigForm
              bare
              title="OpenRouter"
              fields={[
                {
                  name: "openrouterApiKey",
                  label: "API Key",
                  type: "secret",
                  hint: cfg.openrouterApiKey
                    ? "Sudah tersimpan. Kosongkan untuk membiarkannya."
                    : "Belum diisi — sementara memakai OPENROUTER_API_KEY dari .env.",
                  placeholder: "sk-or-v1-…",
                },
                {
                  name: "aiModel",
                  label: "Model utama",
                  type: "text",
                  value: cfg.aiModel,
                  placeholder: "openai/gpt-4o-mini",
                },
                {
                  name: "aiFallbackModels",
                  label: "Model cadangan",
                  type: "text",
                  value: cfg.aiFallbackModels ?? "",
                  hint: "Pisahkan dengan koma. Dipakai kalau model utama gagal.",
                },
              ]}
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}
