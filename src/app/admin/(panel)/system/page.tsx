import { ScrollText } from "lucide-react";
import { HealthMonitor } from "@/components/admin/health-monitor";
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
import { readHealth } from "@/lib/admin-health";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function toneForAction(action: string) {
  if (action.includes("suspend") || action.includes("revoke")) return "danger" as const;
  if (action.includes("activate") || action.includes("premium")) return "positive" as const;
  if (action.includes("login") || action.includes("config")) return "warning" as const;
  return "neutral" as const;
}

export default async function AdminSystemPage() {
  const [health, audits] = await Promise.all([
    readHealth(),
    prisma.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Infrastruktur"
        title="Sistem"
        description="Worker Telegram dan heartbeat berjalan sebagai proses terpisah, jadi statusnya disimpulkan dari jejak tulisan terakhirnya."
      />

      <HealthMonitor initialChecks={health.checks} initialRuntime={health.runtime} />

      <Panel>
        <PanelHeader
          title="Jejak audit admin"
          hint="Setiap aksi yang mengubah keadaan, tercatat permanen"
          icon={ScrollText}
        />
        <InkTable
          caption="Riwayat aksi admin"
          minWidth="44rem"
          head={
            <>
              <Th>Aksi</Th>
              <Th>Ringkasan</Th>
              <Th>Pelaku</Th>
              <Th>IP</Th>
              <Th className="text-right">Waktu</Th>
            </>
          }
        >
          {audits.length === 0 && (
            <EmptyRow colSpan={5}>
              Belum ada aksi tercatat. Riwayat mulai terisi setelah perubahan pertama.
            </EmptyRow>
          )}
          {audits.map((audit) => (
            <Tr key={audit.id}>
              <Td>
                <Tone tone={toneForAction(audit.action)}>{audit.action}</Tone>
              </Td>
              <Td className="text-ink-foreground">{audit.summary}</Td>
              <Td className="text-xs text-ink-muted">{audit.actorName || "—"}</Td>
              <Td className="tabular-money text-xs text-ink-muted">{audit.ip || "—"}</Td>
              <Td className="text-right text-xs text-ink-muted">
                {relativeTime(audit.createdAt)}
              </Td>
            </Tr>
          ))}
        </InkTable>
      </Panel>
    </div>
  );
}
