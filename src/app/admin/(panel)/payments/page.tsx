import { CreditCard, TrendingUp } from "lucide-react";
import Link from "next/link";
import {
  ChartLegend,
  InkAreaChart,
  INK_SERIES,
  type Series,
} from "@/components/admin/ink-chart";
import { RevenueTiles } from "@/components/admin/revenue-tiles";
import {
  EmptyRow,
  InkTable,
  PageHeader,
  Panel,
  PanelHeader,
  Td,
  Th,
  Tone,
  Tr,
  relativeTime,
} from "@/components/admin/ui";
import { formatIdr, readAdminPulse, readGrowthSeries } from "@/lib/admin-metrics";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const PAID = ["settlement", "capture"];

const REVENUE_SERIES: Series[] = [
  { key: "revenue", label: "Pendapatan", color: INK_SERIES.secondary },
];

function toneForStatus(status: string) {
  if (PAID.includes(status)) return "positive" as const;
  if (status === "pending") return "warning" as const;
  if (status === "deny" || status === "cancel" || status === "expire") return "danger" as const;
  return "neutral" as const;
}

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  const where: Prisma.PaymentWhereInput =
    status === "paid"
      ? { status: { in: PAID } }
      : status === "pending"
        ? { status: "pending" }
        : status === "failed"
          ? { status: { in: ["deny", "cancel", "expire"] } }
          : {};

  const [pulse, series, payments, lifetime] = await Promise.all([
    readAdminPulse(),
    readGrowthSeries(30),
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { username: true, name: true } } },
    }),
    prisma.payment.aggregate({
      where: { status: { in: PAID } },
      _sum: { grossAmount: true },
      _count: { _all: true },
    }),
  ]);

  const chips = [
    { value: undefined, label: "Semua" },
    { value: "paid", label: "Lunas" },
    { value: "pending", label: "Menunggu" },
    { value: "failed", label: "Gagal" },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Keuangan"
        title="Pembayaran"
        description="Aktivasi manual dicatat di tabel yang sama dengan order id berawalan manual_."
      />

      <RevenueTiles
        initialPulse={pulse}
        totalRevenue={lifetime._sum.grossAmount ?? 0}
        totalPaid={lifetime._count._all}
      />

      <Panel>
        <PanelHeader
          title="Pendapatan 30 hari"
          icon={TrendingUp}
          actions={<ChartLegend series={REVENUE_SERIES} />}
        />
        <div className="p-4 pr-5">
          <InkAreaChart
            data={series}
            series={REVENUE_SERIES}
            height={230}
            format="idr"
          />
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="Riwayat transaksi"
          hint={`${payments.length} entri terbaru`}
          icon={CreditCard}
          actions={
            <div className="flex flex-wrap gap-1.5">
              {chips.map((chip) => {
                const active = (status ?? undefined) === chip.value;
                return (
                  <Link
                    key={chip.label}
                    href={chip.value ? `?status=${chip.value}` : "?"}
                    className={`inline-flex h-8 items-center rounded-lg border px-2.5 text-[11px] font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-brand-glow/40 ${
                      active
                        ? "border-brand-glow/40 bg-brand-glow/10 text-brand-glow"
                        : "border-ink-border text-ink-muted hover:text-ink-foreground"
                    }`}
                  >
                    {chip.label}
                  </Link>
                );
              })}
            </div>
          }
        />
        <InkTable
          caption="Riwayat pembayaran"
          minWidth="46rem"
          head={
            <>
              <Th>Order</Th>
              <Th>Pengguna</Th>
              <Th className="text-right">Jumlah</Th>
              <Th>Status</Th>
              <Th className="text-right">Waktu</Th>
            </>
          }
        >
          {payments.length === 0 && <EmptyRow colSpan={5}>Belum ada pembayaran.</EmptyRow>}
          {payments.map((payment) => {
            const manual = payment.orderId.startsWith("manual_");
            return (
              <Tr key={payment.id}>
                <Td>
                  <span className="tabular-money text-xs text-ink-muted">{payment.orderId}</span>
                  {manual && (
                    <Tone tone="info" className="ml-2">
                      manual
                    </Tone>
                  )}
                </Td>
                <Td className="text-ink-foreground">
                  {payment.user.username ? `@${payment.user.username}` : payment.user.name || "—"}
                </Td>
                <Td className="tabular-money text-right text-ink-foreground">
                  {payment.grossAmount === 0 ? "—" : formatIdr(payment.grossAmount)}
                </Td>
                <Td>
                  <Tone tone={toneForStatus(payment.status)}>{payment.status}</Tone>
                </Td>
                <Td className="text-right text-xs text-ink-muted">
                  {relativeTime(payment.createdAt)}
                </Td>
              </Tr>
            );
          })}
        </InkTable>
      </Panel>
    </div>
  );
}
