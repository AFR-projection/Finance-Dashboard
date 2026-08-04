/**
 * Tanda "worker heartbeat masih hidup".
 *
 * Sebelumnya kesehatan worker disimpulkan dari baris aiUsageLog ber-source
 * HEARTBEAT — baris yang hanya lahir kalau panggilan LLM sukses. Worker yang
 * sehat tapi melewati semua user (semuanya FREE, atau memang tidak ada yang
 * jatuh tempo) jadi tidak bisa dibedakan dari worker yang mati. Itu persis
 * kondisi yang bikin bug ini tidak ketahuan sekian lama.
 *
 * Kunci ini ditulis tiap tick, terlepas dari ada tidaknya pekerjaan, jadi
 * "prosesnya jalan" dan "ada yang dikerjakan" akhirnya jadi dua sinyal terpisah.
 */

import { redis } from "@/lib/redis";

export const HEARTBEAT_ALIVE_KEY = "ledgerly:heartbeat:alive";

/** Dua kali interval tick plus sedikit kelonggaran, jadi satu tick lambat tidak memicu alarm. */
const ALIVE_TTL_SECONDS = 150;

/** Dipanggil worker tiap tick. Diam-diam no-op kalau Redis tidak dikonfigurasi. */
export async function markHeartbeatAlive(at = new Date()): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(HEARTBEAT_ALIVE_KEY, at.toISOString(), "EX", ALIVE_TTL_SECONDS);
  } catch {
    // Liveness bersifat pelengkap — Redis yang ngambek tidak boleh menjatuhkan
    // siklus heartbeat itu sendiri.
  }
}

export type HeartbeatLiveness =
  /** Redis tidak ada, jadi liveness tidak bisa dipastikan dari sini. */
  | { known: false }
  | { known: true; alive: boolean; lastTickAt: Date | null };

export async function readHeartbeatAlive(): Promise<HeartbeatLiveness> {
  if (!redis) return { known: false };
  try {
    const raw = await redis.get(HEARTBEAT_ALIVE_KEY);
    if (!raw) return { known: true, alive: false, lastTickAt: null };
    const at = new Date(raw);
    return { known: true, alive: true, lastTickAt: Number.isNaN(at.getTime()) ? null : at };
  } catch {
    return { known: false };
  }
}
