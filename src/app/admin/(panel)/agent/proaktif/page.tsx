/**
 * Siklus proaktif — bukti bahwa agent bekerja tanpa disuruh.
 *
 * Halaman ini menjawab satu pertanyaan yang tidak bisa dijawab kanvas: apakah
 * worker heartbeat benar-benar hidup dan melewati jam kirim user. Datanya dari
 * tabel `HeartbeatRun`, bukan buffer telemetri — buffer hanya menyimpan puluhan
 * event terakhir, sedangkan siklus proaktif yang berarti justru yang kemarin.
 *
 * Ringkasan di atas dihitung dari baris yang sama dengan daftar di bawahnya,
 * jadi tidak ada angka yang tidak bisa ditelusuri ke satu baris yang terlihat.
 */

import { CircleSlash, Send, SkipForward, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { HeartbeatList } from "@/components/admin/agent-studio/run-console";
import { PageHeader, Panel, PanelHeader } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Cukup dalam untuk melihat beberapa hari siklus harian tanpa jadi halaman raksasa. */
const TAKE = 60;

export default async function AdminAgentHeartbeatPage() {
  const rows = await prisma.heartbeatRun.findMany({
    orderBy: { startedAt: "desc" },
    take: TAKE,
    select: {
      id: true,
      cadence: true,
      status: true,
      reason: true,
      detail: true,
      attempts: true,
      startedAt: true,
      durationMs: true,
    },
  });

  const count = (status: string) => rows.filter((row) => row.status === status).length;
  const sent = count("SENT");
  const saved = count("SAVED");
  const skipped = count("SKIPPED");
  const failed = count("FAILED");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Siklus proaktif"
        description="Heartbeat berjalan sebagai proses terpisah dan hanya menulis saat jam kirim user terlewati. Baris di bawah adalah jejaknya — termasuk siklus yang sengaja dilewati, yang dulu senyap total."
      />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-border bg-ink-border/60 lg:grid-cols-4">
        <Cell icon={Send} label="Terkirim" value={sent} hint="sampai ke Telegram atau web push" />
        <Cell icon={CircleSlash} label="Disimpan" value={saved} hint="jadi insight, belum dikirim" />
        <Cell
          icon={SkipForward}
          label="Dilewati"
          value={skipped}
          hint="tidak ada yang layak dikirim"
        />
        <Cell
          icon={TriangleAlert}
          label="Gagal"
          value={failed}
          hint="butuh perhatian"
          tone={failed > 0 ? "danger" : undefined}
        />
      </div>

      <Panel className="overflow-hidden">
        <PanelHeader
          title={`${rows.length} siklus terakhir`}
          hint="Alasan skip dan pesan asli penyedia ikut tercatat"
        />
        <HeartbeatList
          rows={rows.map((row) => ({ ...row, startedAt: row.startedAt.toISOString() }))}
        />
      </Panel>
    </div>
  );
}

function Cell({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  hint: string;
  tone?: "danger";
}) {
  return (
    <div className="min-w-0 bg-ink-soft/60 px-4 py-3.5">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">
        <Icon aria-hidden className="size-3 shrink-0" strokeWidth={2.4} />
        <span className="truncate">{label}</span>
      </p>
      <p
        className={cn(
          "tabular-money mt-1.5 text-2xl font-bold leading-none tracking-[-0.02em]",
          tone === "danger" ? "text-rose-300" : "text-ink-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-1 truncate text-[10px] leading-tight text-ink-muted">{hint}</p>
    </div>
  );
}
