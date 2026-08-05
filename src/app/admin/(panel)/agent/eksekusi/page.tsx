/**
 * Eksekusi — apa yang benar-benar dijalankan runtime.
 *
 * Peta nama node dihitung di server dari graph yang sedang dipublish, bukan dari
 * draft: yang menghasilkan run adalah graph yang aktif, jadi nama yang dipakai
 * log harus datang dari sana. Draft yang belum naik bisa punya nama lain untuk
 * node yang sama, dan memakainya akan membuat log berbohong tentang apa yang jalan.
 */

import { readGraphRecord } from "@/ai/graph/store";
import { NODE_DEFINITIONS } from "@/ai/graph/catalogue";
import { RunFeed } from "@/components/admin/agent-studio/run-feed";
import { PageHeader } from "@/components/admin/ui";
import { readRecentAgentEvents } from "@/lib/agent-telemetry";

export const dynamic = "force-dynamic";

export default async function AdminAgentRunsPage() {
  const [record, events] = await Promise.all([readGraphRecord(), readRecentAgentEvents()]);

  const nodeLabels = Object.fromEntries(
    record.published.nodes.map((node) => [
      node.id,
      node.label?.trim() || NODE_DEFINITIONS[node.kind]?.label || node.kind,
    ]),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Eksekusi"
        description="Tiap run yang lewat runtime, node demi node. Buka satu baris untuk melihat waterfall-nya — batang terpanjang adalah node yang membuat run itu lambat."
      />
      <RunFeed initialEvents={events} nodeLabels={nodeLabels} />
    </div>
  );
}
