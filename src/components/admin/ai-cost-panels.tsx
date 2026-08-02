"use client";

import { useEffect, useState } from "react";
import { Cpu, Flame, ListTree } from "lucide-react";
import type { AdminPulse } from "@/lib/admin-metrics";
import { useAdminStream } from "@/components/admin/use-admin-stream";
import { StatGrid, StatTile } from "@/components/admin/stat-tile";
import { INK_SERIES } from "@/components/admin/ink-chart";
import {
  EmptyRow,
  InkTable,
  MiniBar,
  Panel,
  PanelHeader,
  Td,
  Th,
  Tone,
  Tr,
  compactNumber,
  relativeTime,
} from "@/components/admin/ui";

export type ModelRow = { model: string; tokens: number; requests: number };
export type SpenderRow = { userId: string; label: string; tokens: number };
export type RecentCall = {
  id: string;
  model: string;
  source: string;
  tokens: number;
  user: string;
  at: string;
};

export function AiCostPanels({
  initialPulse,
  models,
  spenders,
  recent,
}: {
  initialPulse: AdminPulse;
  models: ModelRow[];
  spenders: SpenderRow[];
  recent: RecentCall[];
}) {
  const { pulse } = useAdminStream(initialPulse);
  const [calls, setCalls] = useState(recent);

  // The pulse carries counters, not rows, so a changed request count is the
  // signal to go fetch the log tail that produced it.
  useEffect(() => {
    let cancelled = false;
    async function refetch() {
      try {
        const res = await fetch("/api/admin/ai-calls", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled && json.ok) setCalls(json.data);
      } catch {
        // Keep the last good tail.
      }
    }
    void refetch();
    return () => {
      cancelled = true;
    };
  }, [pulse.ai.requestsToday]);

  const modelMax = Math.max(1, ...models.map((m) => m.tokens));
  const spenderMax = Math.max(1, ...spenders.map((s) => s.tokens));

  return (
    <div className="space-y-6">
      <StatGrid className="xl:grid-cols-3">
        <StatTile
          label="Token hari ini"
          value={pulse.ai.tokensToday}
          icon={Cpu}
          accent={INK_SERIES.violet}
          format={compactNumber}
          hint={`${pulse.ai.requestsToday} permintaan`}
        />
        <StatTile
          label="Token bulan ini"
          value={pulse.ai.tokensMonth}
          icon={Flame}
          accent={INK_SERIES.secondary}
          format={compactNumber}
          hint="Chat + heartbeat"
        />
        <StatTile
          label="Rata-rata per permintaan"
          value={
            pulse.ai.requestsToday > 0
              ? Math.round(pulse.ai.tokensToday / pulse.ai.requestsToday)
              : 0
          }
          icon={ListTree}
          format={compactNumber}
          hint="Hari ini"
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Token per model" hint="30 hari terakhir" icon={Cpu} />
          {models.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink-muted">Belum ada pemakaian.</p>
          ) : (
            <ul className="space-y-3.5 p-5">
              {models.map((row) => (
                <li key={row.model}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium text-ink-foreground">{row.model}</span>
                    <span className="tabular-money shrink-0 text-ink-muted">
                      {compactNumber(row.tokens)}
                    </span>
                  </div>
                  <MiniBar className="mt-1.5" value={row.tokens} max={modelMax} />
                  <p className="mt-1 text-[11px] text-ink-muted">
                    {row.requests.toLocaleString("id-ID")} permintaan
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Pembakar token teratas" hint="Bulan berjalan" icon={Flame} />
          {spenders.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink-muted">Belum ada pemakaian.</p>
          ) : (
            <ul className="space-y-3.5 p-5">
              {spenders.map((row, index) => (
                <li key={row.userId}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate text-ink-foreground">
                      <span className="mr-2 text-[11px] font-bold text-ink-muted">
                        {index + 1}
                      </span>
                      {row.label}
                    </span>
                    <span className="tabular-money shrink-0 text-ink-muted">
                      {compactNumber(row.tokens)}
                    </span>
                  </div>
                  <MiniBar
                    className="mt-1.5"
                    value={row.tokens}
                    max={spenderMax}
                    tone={index === 0 ? "warning" : "positive"}
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Permintaan terakhir"
          hint="Menetes masuk seiring pemakaian"
          icon={ListTree}
        />
        <div className="max-h-96 overflow-y-auto">
          <InkTable
            caption="Log permintaan AI terbaru"
            minWidth="38rem"
            head={
              <>
                <Th>Pengguna</Th>
                <Th>Model</Th>
                <Th>Sumber</Th>
                <Th className="text-right">Token</Th>
                <Th className="text-right">Waktu</Th>
              </>
            }
          >
            {calls.length === 0 && <EmptyRow colSpan={5}>Belum ada permintaan.</EmptyRow>}
            {calls.map((call) => (
              <Tr key={call.id}>
                <Td className="text-ink-foreground">{call.user}</Td>
                <Td className="text-xs text-ink-muted">{call.model}</Td>
                <Td>
                  <Tone tone={call.source === "HEARTBEAT" ? "info" : "neutral"}>{call.source}</Tone>
                </Td>
                <Td className="tabular-money text-right text-ink-foreground">
                  {call.tokens.toLocaleString("id-ID")}
                </Td>
                <Td className="text-right text-xs text-ink-muted">{relativeTime(call.at)}</Td>
              </Tr>
            ))}
          </InkTable>
        </div>
      </Panel>
    </div>
  );
}
