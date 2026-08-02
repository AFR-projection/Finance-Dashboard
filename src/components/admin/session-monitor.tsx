"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, Monitor, ShieldCheck, Smartphone } from "lucide-react";
import { useAdminStream } from "@/components/admin/use-admin-stream";
import type { AdminEvent, AdminPulse } from "@/lib/admin-metrics";
import {
  EmptyRow,
  InkTable,
  Panel,
  PanelHeader,
  Td,
  Th,
  Tone,
  Tr,
  inkButtonDanger,
  relativeTime,
} from "@/components/admin/ui";

export type LiveSession = {
  id: string;
  scope: string;
  userAgent: string | null;
  ip: string | null;
  country: string | null;
  city: string | null;
  lastSeenAt: string;
  expiresAt: string;
  user: { id: string; username: string | null; name: string | null; role: string };
};

/** Enough to tell a phone from a laptop in a table cell — not device fingerprinting. */
function deviceLabel(userAgent: string | null) {
  if (!userAgent) return { label: "Tidak dikenal", mobile: false };
  const mobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);
  const browser =
    /Edg\//.test(userAgent) ? "Edge"
    : /OPR\//.test(userAgent) ? "Opera"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Safari\//.test(userAgent) ? "Safari"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : "Peramban";
  const os =
    /Windows/i.test(userAgent) ? "Windows"
    : /Mac OS/i.test(userAgent) ? "macOS"
    : /Android/i.test(userAgent) ? "Android"
    : /iPhone|iPad|iOS/i.test(userAgent) ? "iOS"
    : /Linux/i.test(userAgent) ? "Linux"
    : "";
  return { label: os ? `${browser} · ${os}` : browser, mobile };
}

export function SessionMonitor({
  initialPulse,
  initialEvents,
  initialSessions,
}: {
  initialPulse: AdminPulse;
  initialEvents: AdminEvent[];
  initialSessions: LiveSession[];
}) {
  const { pulse, events } = useAdminStream(initialPulse, initialEvents);
  const [sessions, setSessions] = useState(initialSessions);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Session count is part of the pulse, so a change there means the list moved.
  // The fetch is deferred by a frame: the effect subscribes, it does not set
  // state on its own tick.
  useEffect(() => {
    let cancelled = false;

    const handle = setTimeout(async () => {
      try {
        const res = await fetch("/api/admin/sessions", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled && json.ok) setSessions(json.data);
      } catch {
        // Keep the last known list rather than blanking the table.
      }
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [pulse.sessions.live, pulse.sessions.admin, events.length]);

  async function revoke(sessionId: string) {
    setError(null);
    setRevoking(sessionId);
    try {
      const res = await fetch("/api/admin/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "Gagal mencabut sesi.");
        return;
      }
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch {
      setError("Gagal terhubung ke server.");
    } finally {
      setRevoking(null);
    }
  }

  return (
    <Panel>
      <PanelHeader
        title="Sesi berjalan"
        hint={`${pulse.sessions.live} sesi pengguna · ${pulse.sessions.admin} konsol admin`}
        icon={ShieldCheck}
        actions={
          error ? (
            <span role="alert" className="text-xs text-rose-300">
              {error}
            </span>
          ) : undefined
        }
      />
      <InkTable
        caption="Sesi yang sedang aktif"
        minWidth="50rem"
        head={
          <>
            <Th>Pemilik</Th>
            <Th>Perangkat</Th>
            <Th>Lokasi</Th>
            <Th>Terakhir aktif</Th>
            <Th className="text-right">Aksi</Th>
          </>
        }
      >
        {sessions.length === 0 && <EmptyRow colSpan={5}>Tidak ada sesi aktif.</EmptyRow>}
        {sessions.map((session) => {
          const device = deviceLabel(session.userAgent);
          const isAdmin = session.scope === "ADMIN";
          return (
            <Tr key={session.id}>
              <Td>
                <p className="font-semibold text-ink-foreground">
                  {session.user.username ? `@${session.user.username}` : session.user.name || "—"}
                </p>
                <div className="mt-1 flex items-center gap-1.5">
                  <Tone tone={isAdmin ? "warning" : "neutral"}>{session.scope}</Tone>
                  {session.user.role === "ADMIN" && <Tone tone="info">admin</Tone>}
                </div>
              </Td>
              <Td>
                <span className="flex items-center gap-2 text-xs text-ink-muted">
                  {device.mobile ? (
                    <Smartphone aria-hidden className="size-3.5" strokeWidth={2} />
                  ) : (
                    <Monitor aria-hidden className="size-3.5" strokeWidth={2} />
                  )}
                  {device.label}
                </span>
              </Td>
              <Td className="text-xs text-ink-muted">
                {[session.city, session.country].filter(Boolean).join(", ") || "—"}
                {session.ip && (
                  <span className="tabular-money mt-0.5 block opacity-60">{session.ip}</span>
                )}
              </Td>
              <Td className="text-xs text-ink-muted">
                {relativeTime(session.lastSeenAt)}
                <span className="mt-0.5 block opacity-60">
                  berakhir {relativeTime(session.expiresAt)}
                </span>
              </Td>
              <Td className="text-right">
                <button
                  type="button"
                  onClick={() => void revoke(session.id)}
                  disabled={revoking === session.id}
                  className={inkButtonDanger}
                >
                  {revoking === session.id ? (
                    <Loader2 aria-hidden className="size-3.5 animate-spin" />
                  ) : (
                    <KeyRound aria-hidden className="size-3.5" strokeWidth={2.2} />
                  )}
                  Cabut
                </button>
              </Td>
            </Tr>
          );
        })}
      </InkTable>
    </Panel>
  );
}
