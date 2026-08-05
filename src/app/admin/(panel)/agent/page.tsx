/**
 * Ringkasan Agent Studio — halaman pertama seksi ini.
 *
 * Sebelumnya `/agent` adalah seluruh studio dalam satu halaman: topbar, rail
 * metrik, palette, kanvas, inspector, dan dok tiga tab berebut satu tinggi
 * viewport. Sekarang ia menjawab satu pertanyaan saja — bagaimana keadaan agent —
 * dan mengantar ke halaman yang menjawab sisanya.
 */

import { NODE_DEFINITIONS } from "@/ai/graph/catalogue";
import { validateGraph } from "@/ai/graph/compile";
import { readGraphRecord } from "@/ai/graph/store";
import { AgentOverview } from "@/components/admin/agent-studio/overview";
import { PageHeader } from "@/components/admin/ui";
import { readAgentStats } from "@/lib/agent-stats";
import { readRecentAgentEvents } from "@/lib/agent-telemetry";

export const dynamic = "force-dynamic";

export default async function AdminAgentOverviewPage() {
  const [record, events, stats] = await Promise.all([
    readGraphRecord(),
    readRecentAgentEvents(),
    readAgentStats(),
  ]);

  // Yang diringkas adalah susunan yang sedang DIPAKAI runtime, bukan draft:
  // pertanyaan halaman ini "bagaimana keadaannya sekarang", dan draft belum
  // menghasilkan satu pun run. Keberadaan draft tetap dilaporkan sebagai lencana.
  const active = record.published;
  const labels = Object.fromEntries(
    active.nodes.map((node) => [
      node.id,
      node.label?.trim() || NODE_DEFINITIONS[node.kind]?.label || node.kind,
    ]),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ringkasan"
        description="Kondisi agent dari angka yang bisa ditelusuri ke tabel atau buffer — tidak ada indikator yang selalu hijau."
      />

      <AgentOverview
        stats={stats}
        initialEvents={events}
        graph={{
          version: record.version,
          publishedAt: record.publishedAt?.toISOString() ?? null,
          hasDraft: record.draft !== null,
          nodes: active.nodes.length,
          enabledNodes: active.nodes.filter((node) => node.enabled).length,
          edges: active.edges.length,
          issues: validateGraph(active),
          labels,
        }}
      />
    </div>
  );
}
