import { Cpu, Gauge, Zap } from "lucide-react";
import {
  ChartLegend,
  InkBarChart,
  INK_SERIES,
  type Series,
} from "@/components/admin/ink-chart";
import {
  EmptyRow,
  InkTable,
  MiniBar,
  PageHeader,
  Panel,
  PanelHeader,
  Td,
  Th,
  Tone,
  Tr,
  compactNumber,
} from "@/components/admin/ui";
import { currentPeriodKey } from "@/ai/usage";
import { readGrowthSeries } from "@/lib/admin-metrics";
import { getAppConfigRaw } from "@/lib/app-config";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const TOKEN_SERIES: Series[] = [
  { key: "chatTokens", label: "Chat", color: INK_SERIES.primary },
  { key: "heartbeatTokens", label: "Heartbeat", color: INK_SERIES.secondary },
];

export default async function AdminUsagePage() {
  const periodKey = currentPeriodKey();
  const nowMs = new Date().getTime();

  const [cfg, rows, series, premiumUsers] = await Promise.all([
    getAppConfigRaw(),
    prisma.aiUsageMonthly.findMany({
      where: { periodKey },
      orderBy: { tokens: "desc" },
      take: 100,
      include: {
        user: {
          select: {
            username: true,
            name: true,
            tokenQuotaOverride: true,
            subscription: { select: { tier: true, currentPeriodEnd: true } },
          },
        },
      },
    }),
    readGrowthSeries(30),
    prisma.subscription.count({ where: { tier: "PREMIUM", currentPeriodEnd: { gt: new Date() } } }),
  ]);

  const sum = (list: typeof rows) => list.reduce((total, row) => total + row.tokens, 0);
  const chat = rows.filter((r) => r.source === "CHAT");
  const heartbeat = rows.filter((r) => r.source === "HEARTBEAT");
  const chatTotal = sum(chat);
  const heartbeatTotal = sum(heartbeat);
  const grandTotal = chatTotal + heartbeatTotal;

  const totals = [
    {
      label: "Token chat",
      value: chatTotal,
      hint: "Memotong kuota pengguna",
      icon: Cpu,
    },
    {
      label: "Token heartbeat",
      value: heartbeatTotal,
      hint: "Ditanggung platform",
      icon: Zap,
    },
    {
      label: "Total periode ini",
      value: grandTotal,
      hint: `${rows.length} baris pemakaian · ${premiumUsers} akun premium`,
      icon: Gauge,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Telemetri"
        title="Pemakaian token"
        description={`Periode ${periodKey} · 100 pemakai teratas.`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {totals.map((total) => (
          <Panel key={total.label} className="p-5">
            <span className="grid size-9 place-items-center rounded-xl bg-ink text-brand-glow">
              <total.icon aria-hidden className="size-4" strokeWidth={2.2} />
            </span>
            <p className="tabular-money mt-4 text-2xl font-bold tracking-[-0.02em] text-ink-foreground">
              {total.value.toLocaleString("id-ID")}
            </p>
            <p className="mt-1 text-sm text-ink-muted">{total.label}</p>
            <p className="mt-0.5 text-[11px] text-ink-muted/70">{total.hint}</p>
          </Panel>
        ))}
      </div>

      <Panel>
        <PanelHeader
          title="Konsumsi token 30 hari"
          hint="Bertumpuk per sumber"
          icon={Gauge}
          actions={<ChartLegend series={TOKEN_SERIES} />}
        />
        <div className="p-4 pr-5">
          <InkBarChart data={series} series={TOKEN_SERIES} height={250} stacked />
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Pemakaian per pengguna" hint={`Periode ${periodKey}`} icon={Cpu} />
        <InkTable
          caption="Pemakaian token per pengguna"
          minWidth="44rem"
          head={
            <>
              <Th>Pengguna</Th>
              <Th>Sumber</Th>
              <Th>Porsi kuota</Th>
              <Th className="text-right">Token</Th>
              <Th className="text-right">Permintaan</Th>
            </>
          }
        >
          {rows.length === 0 && <EmptyRow colSpan={5}>Belum ada pemakaian bulan ini.</EmptyRow>}
          {rows.map((row) => {
            const sub = row.user.subscription;
            const premium = sub?.tier === "PREMIUM" && sub.currentPeriodEnd.getTime() > nowMs;
            const quota =
              row.user.tokenQuotaOverride ??
              (premium ? cfg.premiumTokenQuota : cfg.freeTokenQuota);
            // Heartbeat is platform-funded, so it is never measured against a quota.
            const metered = row.source === "CHAT" && quota > 0;
            const pct = metered ? Math.round((row.tokens / quota) * 100) : 0;

            return (
              <Tr key={`${row.userId}-${row.source}`}>
                <Td className="text-ink-foreground">
                  {row.user.username ? `@${row.user.username}` : row.user.name || "—"}
                </Td>
                <Td>
                  <Tone tone={row.source === "HEARTBEAT" ? "info" : "neutral"}>{row.source}</Tone>
                </Td>
                <Td>
                  {metered ? (
                    <div className="w-36">
                      <div className="tabular-money flex items-baseline justify-between text-[11px]">
                        <span className="text-ink-muted">{compactNumber(quota)} kuota</span>
                        <span className="font-semibold text-ink-foreground">{pct}%</span>
                      </div>
                      <MiniBar
                        className="mt-1.5"
                        value={row.tokens}
                        max={quota}
                        tone={pct >= 90 ? "danger" : pct >= 70 ? "warning" : "positive"}
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-ink-muted">
                      {row.source === "HEARTBEAT" ? "ditanggung platform" : "tanpa batas"}
                    </span>
                  )}
                </Td>
                <Td className="tabular-money text-right text-ink-foreground">
                  {row.tokens.toLocaleString("id-ID")}
                </Td>
                <Td className="tabular-money text-right text-ink-muted">{row.requests}</Td>
              </Tr>
            );
          })}
        </InkTable>
      </Panel>
    </div>
  );
}
