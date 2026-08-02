"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  BadgeCheck,
  Banknote,
  CircleDot,
  Cpu,
  Radio,
  ShieldAlert,
  TrendingUp,
  Users,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import type { AdminEvent, AdminPulse } from "@/lib/admin-metrics";
import { ActivityFeed } from "@/components/admin/activity-feed";
import { useAdminStream, type StreamStatus } from "@/components/admin/use-admin-stream";
import { StatGrid, StatTile, revealTransition, revealVariants } from "@/components/admin/stat-tile";
import {
  ChartLegend,
  InkAreaChart,
  InkBarChart,
  InkDonut,
  INK_SERIES,
  type Series,
} from "@/components/admin/ink-chart";
import { LiveDot, Panel, PanelHeader, PageHeader, Tone, compactNumber } from "@/components/admin/ui";

type GrowthPoint = {
  date: string;
  label: string;
  signups: number;
  revenue: number;
  chatTokens: number;
  heartbeatTokens: number;
};

const money = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

const GROWTH_SERIES: Series[] = [
  { key: "signups", label: "Pendaftar", color: INK_SERIES.primary },
];
const TOKEN_SERIES: Series[] = [
  { key: "chatTokens", label: "Chat", color: INK_SERIES.primary },
  { key: "heartbeatTokens", label: "Heartbeat", color: INK_SERIES.secondary },
];

/**
 * Age of the last pulse, in seconds.
 *
 * Kept on a timer rather than read during render: the clock is impure, and a
 * render-time read would freeze the counter between pulses anyway.
 */
function useSecondsSince(timestamp: number) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setSeconds(Math.max(0, Math.round((Date.now() - timestamp) / 1000))),
      1000,
    );
    return () => clearInterval(timer);
  }, [timestamp]);

  return seconds;
}

function ConnectionBadge({ status, lastBeat }: { status: StreamStatus; lastBeat: number }) {
  const map = {
    live: { tone: "positive" as const, label: "Realtime aktif", icon: Radio },
    connecting: { tone: "neutral" as const, label: "Menyambung…", icon: CircleDot },
    polling: { tone: "warning" as const, label: "Mode polling", icon: WifiOff },
    denied: { tone: "danger" as const, label: "Stream ditolak", icon: ShieldAlert },
  };
  const { tone, label, icon: Icon } = map[status];
  const seconds = useSecondsSince(lastBeat);

  return (
    <Tone tone={tone} className="h-8 px-3">
      {status === "live" ? (
        <LiveDot />
      ) : (
        <Icon aria-hidden className="size-3.5" strokeWidth={2.4} />
      )}
      {label}
      {status === "live" && (
        <span className="tabular-money font-normal opacity-70">· {seconds}s</span>
      )}
    </Tone>
  );
}

export function OverviewClient({
  initialPulse,
  initialEvents,
  growth,
}: {
  initialPulse: AdminPulse;
  initialEvents: AdminEvent[];
  growth: GrowthPoint[];
}) {
  const reduced = useReducedMotion();
  const { pulse, events, status, lastBeat } = useAdminStream(initialPulse, initialEvents);

  const freeUsers = Math.max(0, pulse.users.total - pulse.users.premium);
  const planMix = [
    { name: "Premium", value: pulse.users.premium, color: INK_SERIES.primary },
    { name: "Gratis", value: freeUsers, color: INK_SERIES.tertiary },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Konsol operasi"
        title="Ringkasan platform"
        description={`${pulse.users.new24h} pendaftar baru dan ${compactNumber(pulse.activity.transactions24h)} transaksi dalam 24 jam terakhir.`}
        actions={<ConnectionBadge status={status} lastBeat={lastBeat} />}
      />

      <StatGrid>
        <StatTile
          label="Total pengguna"
          value={pulse.users.total}
          icon={Users}
          hint={`${pulse.users.active} aktif · ${pulse.users.suspended} ditangguhkan`}
          delta={pulse.users.new24h}
          spark={growth}
          sparkKey="signups"
        />
        <StatTile
          label="Sesi berjalan"
          value={pulse.sessions.live}
          icon={Activity}
          accent={INK_SERIES.tertiary}
          hint={`${pulse.sessions.admin} konsol admin · ${pulse.sessions.pendingChallenges} menunggu izin`}
        />
        <StatTile
          label="Token AI hari ini"
          value={pulse.ai.tokensToday}
          icon={Cpu}
          accent={INK_SERIES.violet}
          format={compactNumber}
          hint={`${pulse.ai.requestsToday} permintaan · ${compactNumber(pulse.ai.tokensMonth)} bulan ini`}
        />
        <StatTile
          label="Pendapatan hari ini"
          value={pulse.money.revenueToday}
          icon={Banknote}
          accent={INK_SERIES.secondary}
          format={money}
          hint={`${pulse.money.paidToday} pembayaran · ${money(pulse.money.revenueMonth)} bulan ini`}
        />
      </StatGrid>

      <div className="grid gap-4 xl:grid-cols-3">
        <motion.div
          initial={reduced ? undefined : "hidden"}
          animate={reduced ? undefined : "show"}
          variants={revealVariants}
          transition={revealTransition}
          className="xl:col-span-2"
        >
          <Panel>
            <PanelHeader
              title="Pertumbuhan 30 hari"
              hint="Pendaftar baru per hari"
              icon={TrendingUp}
              actions={<ChartLegend series={GROWTH_SERIES} />}
            />
            <div className="p-4 pr-5">
              <InkAreaChart data={growth} series={GROWTH_SERIES} height={250} />
            </div>
          </Panel>
        </motion.div>

        <motion.div
          initial={reduced ? undefined : "hidden"}
          animate={reduced ? undefined : "show"}
          variants={revealVariants}
          transition={{ ...revealTransition, delay: 0.06 }}
        >
          <Panel className="h-full">
            <PanelHeader title="Komposisi paket" icon={BadgeCheck} />
            <div className="p-4">
              <InkDonut data={planMix} height={190} />
              <ul className="mt-3 space-y-2">
                {planMix.map((slice) => (
                  <li key={slice.name} className="flex items-center gap-2 text-sm">
                    <span
                      aria-hidden
                      className="size-2.5 rounded-sm"
                      style={{ background: slice.color }}
                    />
                    <span className="text-ink-muted">{slice.name}</span>
                    <span className="tabular-money ml-auto font-semibold text-ink-foreground">
                      {slice.value.toLocaleString("id-ID")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
        </motion.div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <motion.div
          initial={reduced ? undefined : "hidden"}
          animate={reduced ? undefined : "show"}
          variants={revealVariants}
          transition={{ ...revealTransition, delay: 0.1 }}
          className="xl:col-span-2"
        >
          <Panel>
            <PanelHeader
              title="Pemakaian token 30 hari"
              hint="Chat memotong kuota pengguna; heartbeat ditanggung platform"
              icon={Cpu}
              actions={<ChartLegend series={TOKEN_SERIES} />}
            />
            <div className="p-4 pr-5">
              <InkBarChart data={growth} series={TOKEN_SERIES} height={230} stacked />
            </div>
          </Panel>
        </motion.div>

        <motion.div
          initial={reduced ? undefined : "hidden"}
          animate={reduced ? undefined : "show"}
          variants={revealVariants}
          transition={{ ...revealTransition, delay: 0.14 }}
        >
          <Panel className="flex h-full flex-col">
            <PanelHeader
              title="Aktivitas langsung"
              icon={Radio}
              actions={
                <Link
                  href="/security"
                  className="rounded-lg px-2 py-1 text-[11px] font-semibold text-brand-glow outline-none transition-colors hover:bg-brand-glow/10 focus-visible:ring-3 focus-visible:ring-brand-glow/40"
                >
                  Keamanan
                </Link>
              }
            />
            <div className="max-h-[26rem] flex-1 overflow-y-auto">
              <ActivityFeed events={events} limit={14} />
            </div>
          </Panel>
        </motion.div>
      </div>
    </div>
  );
}
