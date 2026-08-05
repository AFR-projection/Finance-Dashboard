/**
 * Kanvas — tempat pipeline agent disusun.
 *
 * Semua yang dibutuhkan kanvas dimuat di server dalam satu gelombang: graph
 * (draft + yang dipublish), katalog node, dan jejak run terakhir untuk kedipan
 * awal. Kanvas yang harus menembak beberapa fetch sendiri sesudah hydrate akan
 * tampil kosong lebih dulu, lalu melompat — pada halaman sepadat ini lompatan
 * itu terbaca sebagai kerusakan.
 *
 * Tanpa `PageHeader`: ini satu-satunya halaman seksi yang butuh seluruh sisa
 * tinggi layar, dan judul beserta status graph-nya sudah dibawa topbar studio.
 */

import { NODE_DEFINITION_LIST } from "@/ai/graph/catalogue";
import { validateGraph } from "@/ai/graph/compile";
import { DEFAULT_GRAPH } from "@/ai/graph/default-graph";
import { readGraphRecord } from "@/ai/graph/store";
import { AgentStudio } from "@/components/admin/agent-studio/agent-studio";
import { readRecentAgentEvents } from "@/lib/agent-telemetry";

export const dynamic = "force-dynamic";

export default async function AdminAgentCanvasPage() {
  const [record, events] = await Promise.all([readGraphRecord(), readRecentAgentEvents()]);

  return (
    <AgentStudio
      payload={{
        version: record.version,
        published: record.published,
        draft: record.draft,
        publishedAt: record.publishedAt?.toISOString() ?? null,
        updatedBy: record.updatedBy,
        catalogue: NODE_DEFINITION_LIST,
        defaultGraph: DEFAULT_GRAPH,
        issues: validateGraph(record.draft ?? record.published),
      }}
      initialEvents={events}
    />
  );
}
