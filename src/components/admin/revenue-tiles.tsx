"use client";

import { Banknote, Receipt, TrendingUp, Wallet } from "lucide-react";
import type { AdminPulse } from "@/lib/admin-metrics";
import { useAdminStream } from "@/components/admin/use-admin-stream";
import { StatGrid, StatTile } from "@/components/admin/stat-tile";
import { INK_SERIES } from "@/components/admin/ink-chart";

const money = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

export function RevenueTiles({
  initialPulse,
  totalRevenue,
  totalPaid,
}: {
  initialPulse: AdminPulse;
  totalRevenue: number;
  totalPaid: number;
}) {
  const { pulse } = useAdminStream(initialPulse);

  return (
    <StatGrid>
      <StatTile
        label="Pendapatan hari ini"
        value={pulse.money.revenueToday}
        icon={Banknote}
        format={money}
        hint={`${pulse.money.paidToday} pembayaran lunas`}
      />
      <StatTile
        label="Pendapatan bulan ini"
        value={pulse.money.revenueMonth}
        icon={TrendingUp}
        accent={INK_SERIES.secondary}
        format={money}
      />
      <StatTile
        label="Total sepanjang masa"
        value={totalRevenue}
        icon={Wallet}
        accent={INK_SERIES.tertiary}
        format={money}
      />
      <StatTile
        label="Pembayaran lunas"
        value={totalPaid}
        icon={Receipt}
        accent={INK_SERIES.violet}
        hint="Termasuk aktivasi manual"
      />
    </StatGrid>
  );
}
