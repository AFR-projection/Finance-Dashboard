import type { Server as SocketIOServer } from "socket.io";
import { getSocketServer } from "@/lib/socket-server";
import { readAdminPulse, type AdminEvent, type AdminPulse } from "@/lib/admin-metrics";

export const ADMIN_ROOM = "admin";

const PULSE_INTERVAL_MS = 3000;
/** ~30s between membership re-checks: cheap, and well under the 4h session TTL. */
const REVERIFY_EVERY_TICKS = 10;

declare global {
  var __ledgerlyAdminPulse: NodeJS.Timeout | undefined;
}

/**
 * Push a one-off happening to every open console.
 *
 * Fire-and-forget by design: an admin console that misses a notification is a
 * cosmetic problem, but a socket failure that rejects a payment webhook is not.
 */
export function emitAdminEvent(event: Omit<AdminEvent, "id" | "at"> & { id?: string; at?: string }) {
  const io = getSocketServer();
  if (!io) return;
  io.to(ADMIN_ROOM).emit("admin:event", {
    id: event.id ?? `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: event.at ?? new Date().toISOString(),
    ...event,
  } satisfies AdminEvent);
}

function countAdmins(io: SocketIOServer) {
  return io.sockets.adapter.rooms.get(ADMIN_ROOM)?.size ?? 0;
}

/** Re-checks every socket in the room and evicts the ones that no longer qualify. */
async function evictStaleAdmins(io: SocketIOServer, verify: AdminVerifier) {
  const room = io.sockets.adapter.rooms.get(ADMIN_ROOM);
  if (!room) return;
  for (const socketId of room) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;
    if (await verify(socket.handshake.headers.cookie)) continue;
    socket.leave(ADMIN_ROOM);
    socket.emit("admin:ready", { ok: false });
  }
}

export type AdminVerifier = (cookieHeader: string | undefined) => Promise<boolean>;

/**
 * Polls the database and broadcasts whatever changed.
 *
 * A ticker exists at all because the Telegram and heartbeat workers are
 * separate pm2 processes with no socket instance of their own — their writes
 * would otherwise be invisible until a manual refresh.
 *
 * Two properties keep it cheap: it does nothing at all while no console is
 * open, and it only emits when the snapshot actually differs. It is read-only,
 * so several instances pointed at the same database cannot conflict.
 */
export function startAdminPulse(io: SocketIOServer, verify: AdminVerifier) {
  if (globalThis.__ledgerlyAdminPulse) clearInterval(globalThis.__ledgerlyAdminPulse);

  let previous: string | null = null;
  let inFlight = false;
  let ticks = 0;

  const timer = setInterval(async () => {
    if (inFlight || countAdmins(io) === 0) return;
    inFlight = true;
    try {
      // A socket outlives the request that authorised it, so membership is
      // re-checked periodically rather than trusted for the connection's life.
      if (++ticks % REVERIFY_EVERY_TICKS === 0) {
        await evictStaleAdmins(io, verify);
        if (countAdmins(io) === 0) return;
      }

      const pulse = await readAdminPulse();
      // `at` moves every tick, so it is blanked out of the change comparison.
      const fingerprint = JSON.stringify({ ...pulse, at: "" });
      if (fingerprint !== previous) {
        previous = fingerprint;
        io.to(ADMIN_ROOM).emit("admin:pulse", pulse satisfies AdminPulse);
      }
    } catch (error) {
      console.warn("[admin-pulse] gagal membaca metrik:", error);
    } finally {
      inFlight = false;
    }
  }, PULSE_INTERVAL_MS);

  // Never hold the event loop open for a telemetry timer.
  timer.unref?.();
  globalThis.__ledgerlyAdminPulse = timer;
}
