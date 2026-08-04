/**
 * Agent Studio — susunan pipeline AI sebagai halaman.
 *
 * Semua yang dibutuhkan kanvas dimuat di server dalam satu gelombang: graph
 * (draft + yang dipublish), katalog node, riwayat revisi, dan jejak run terakhir.
 * Kanvas yang harus menembak beberapa fetch sendiri sesudah hydrate akan tampil
 * kosong lebih dulu, lalu melompat — pada halaman sepadat ini lompatan itu
 * terbaca sebagai kerusakan.
 */

import { NODE_DEFINITION_LIST } from "@/ai/graph/catalogue";
import { validateGraph } from "@/ai/graph/compile";
import { DEFAULT_GRAPH } from "@/ai/graph/default-graph";
import { readGraphRecord } from "@/ai/graph/store";
import { AgentStudio } from "@/components/admin/agent-studio/agent-studio";
import { PageHeader } from "@/components/admin/ui";
import { readRecentAgentEvents } from "@/lib/agent-telemetry";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminAgentPage() {
  const [record, revisions, events, heartbeatRuns] = await Promise.all([
    readGraphRecord(),
    prisma.agentGraphRevision.findMany({
      orderBy: { version: "desc" },
      take: 20,
      select: { version: true, note: true, actorUserId: true, createdAt: true },
    }),
    readRecentAgentEvents(),
    prisma.heartbeatRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 20,
      select: {
        id: true,
        cadence: true,
        status: true,
        reason: true,
        startedAt: true,
        durationMs: true,
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="Agent Studio"
        description="Susunan node di sini benar-benar menggerakkan agent. Draft bebas diubah kapan saja; hanya Publish yang menyentuh runtime yang sedang melayani user."
      />

      <AgentStudio
        payload={{
          version: record.version,
          published: record.published,
          draft: record.draft,
          publishedAt: record.publishedAt?.toISOString() ?? null,
          updatedBy: record.updatedBy,
          revisions: revisions.map((revision) => ({
            ...revision,
            createdAt: revision.createdAt.toISOString(),
          })),
          catalogue: NODE_DEFINITION_LIST,
          defaultGraph: DEFAULT_GRAPH,
          issues: validateGraph(record.draft ?? record.published),
        }}
        initialEvents={events}
        heartbeatRuns={heartbeatRuns.map((run) => ({
          ...run,
          startedAt: run.startedAt.toISOString(),
        }))}
      />
    </div>
  );
}
