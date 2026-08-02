import { Clock, Fingerprint, Radio, ShieldAlert } from "lucide-react";
import { ActivityFeed } from "@/components/admin/activity-feed";
import { SessionMonitor, type LiveSession } from "@/components/admin/session-monitor";
import {
  EmptyRow,
  EmptyState,
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
import { readAdminPulse, readRecentEvents } from "@/lib/admin-metrics";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const CHALLENGE_TONE = {
  PENDING: "warning",
  APPROVED: "positive",
  REJECTED: "danger",
  CONSUMED: "neutral",
} as const;

export default async function AdminSecurityPage() {
  const now = new Date();

  const [pulse, events, sessions, challenges, devices] = await Promise.all([
    readAdminPulse(),
    readRecentEvents(25),
    prisma.accessSession.findMany({
      where: { revokedAt: null, expiresAt: { gt: now } },
      orderBy: { lastSeenAt: "desc" },
      take: 100,
      select: {
        id: true,
        scope: true,
        userAgent: true,
        ip: true,
        country: true,
        city: true,
        lastSeenAt: true,
        expiresAt: true,
        user: { select: { id: true, username: true, name: true, role: true } },
      },
    }),
    prisma.accessChallenge.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        purpose: true,
        status: true,
        username: true,
        ip: true,
        country: true,
        city: true,
        createdAt: true,
        expiresAt: true,
      },
    }),
    prisma.trustedDevice.findMany({
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        label: true,
        lastIp: true,
        lastCountry: true,
        lastCity: true,
        updatedAt: true,
        user: { select: { username: true, name: true } },
      },
    }),
  ]);

  const liveSessions: LiveSession[] = sessions.map((s) => ({
    ...s,
    lastSeenAt: s.lastSeenAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Kontrol akses"
        title="Keamanan"
        description="Mencabut sesi berlaku seketika — cookie yang sudah beredar ikut mati."
        actions={
          pulse.sessions.pendingChallenges > 0 ? (
            <Tone tone="warning">
              <ShieldAlert aria-hidden className="size-3.5" strokeWidth={2.4} />
              {pulse.sessions.pendingChallenges} menunggu izin
            </Tone>
          ) : undefined
        }
      />

      <SessionMonitor
        initialPulse={pulse}
        initialEvents={events}
        initialSessions={liveSessions}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Permintaan akses terbaru"
            hint="Konfirmasi login dan pendaftaran lewat Telegram"
            icon={Clock}
          />
          <InkTable
            caption="Riwayat permintaan akses"
            minWidth="40rem"
            head={
              <>
                <Th>Tujuan</Th>
                <Th>Identitas</Th>
                <Th>Lokasi</Th>
                <Th>Status</Th>
                <Th className="text-right">Dibuat</Th>
              </>
            }
          >
            {challenges.length === 0 && (
              <EmptyRow colSpan={5}>Belum ada permintaan akses.</EmptyRow>
            )}
            {challenges.map((challenge) => {
              const expired =
                challenge.status === "PENDING" && challenge.expiresAt.getTime() <= now.getTime();
              return (
                <Tr key={challenge.id}>
                  <Td className="text-xs font-semibold text-ink-foreground">{challenge.purpose}</Td>
                  <Td className="text-xs text-ink-muted">
                    {challenge.username ? `@${challenge.username}` : "—"}
                  </Td>
                  <Td className="text-xs text-ink-muted">
                    {[challenge.city, challenge.country].filter(Boolean).join(", ") ||
                      challenge.ip ||
                      "—"}
                  </Td>
                  <Td>
                    <Tone tone={expired ? "neutral" : CHALLENGE_TONE[challenge.status]}>
                      {expired ? "KEDALUWARSA" : challenge.status}
                    </Tone>
                  </Td>
                  <Td className="text-right text-xs text-ink-muted">
                    {relativeTime(challenge.createdAt)}
                  </Td>
                </Tr>
              );
            })}
          </InkTable>
        </Panel>

        <Panel className="flex flex-col">
          <PanelHeader title="Peristiwa keamanan" icon={Radio} />
          <div className="max-h-[28rem] flex-1 overflow-y-auto">
            <ActivityFeed events={events} limit={16} />
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Perangkat terpercaya"
          hint="Sidik jari peramban yang pernah lolos verifikasi"
          icon={Fingerprint}
        />
        {devices.length === 0 ? (
          <EmptyState
            icon={Fingerprint}
            title="Belum ada perangkat terdaftar"
            description="Perangkat tercatat setelah pengguna menyetujui login dari peramban baru."
          />
        ) : (
          <InkTable
            caption="Perangkat terpercaya"
            minWidth="38rem"
            head={
              <>
                <Th>Pemilik</Th>
                <Th>Label</Th>
                <Th>Lokasi terakhir</Th>
                <Th className="text-right">Diperbarui</Th>
              </>
            }
          >
            {devices.map((device) => (
              <Tr key={device.id}>
                <Td className="text-ink-foreground">
                  {device.user.username ? `@${device.user.username}` : device.user.name || "—"}
                </Td>
                <Td className="text-xs text-ink-muted">{device.label || "tanpa label"}</Td>
                <Td className="text-xs text-ink-muted">
                  {[device.lastCity, device.lastCountry].filter(Boolean).join(", ") ||
                    device.lastIp ||
                    "—"}
                </Td>
                <Td className="text-right text-xs text-ink-muted">
                  {relativeTime(device.updatedAt)}
                </Td>
              </Tr>
            ))}
          </InkTable>
        )}
      </Panel>
    </div>
  );
}
