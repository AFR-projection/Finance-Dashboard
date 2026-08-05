/**
 * Versi — apa yang berubah, kapan, dan cara kembali.
 */

import { History } from "lucide-react";
import { readGraphRecord } from "@/ai/graph/store";
import { RevisionList } from "@/components/admin/agent-studio/revision-list";
import { PageHeader, Panel, PanelHeader } from "@/components/admin/ui";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const TAKE = 50;

export default async function AdminAgentVersionsPage() {
  const [record, revisions] = await Promise.all([
    readGraphRecord(),
    prisma.agentGraphRevision.findMany({
      orderBy: { version: "desc" },
      take: TAKE,
      select: { version: true, note: true, actorUserId: true, createdAt: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Versi"
        description="Setiap publish menyimpan salinan utuh graph-nya. Rollback memasang salinan itu kembali dan mencatatnya sebagai versi baru, jadi tidak ada riwayat yang hilang."
      />

      <Panel className="overflow-hidden">
        <PanelHeader
          title="Riwayat publish"
          hint={
            record.version === 0
              ? "Belum pernah dipublish — runtime memakai susunan bawaan"
              : `Runtime sedang memakai v${record.version}`
          }
          icon={History}
        />
        <RevisionList
          activeVersion={record.version}
          revisions={revisions.map((revision) => ({
            ...revision,
            createdAt: revision.createdAt.toISOString(),
          }))}
        />
      </Panel>
    </div>
  );
}
