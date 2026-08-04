/**
 * Aliran kejadian per-run dari runtime agent ke kanvas Agent Studio.
 *
 * Tiga sikap yang disengaja:
 *
 * 1. **Tidak pernah menggagalkan run.** Setiap emit dibungkus try/catch dan
 *    tidak di-await oleh pemanggilnya. Konsol admin yang melewatkan satu event
 *    adalah masalah kosmetik; telemetri yang menjatuhkan pencatatan transaksi
 *    bukan.
 * 2. **Lintas proses lewat Redis.** Worker Telegram dan worker heartbeat adalah
 *    proses terpisah tanpa server socket sendiri, jadi mereka tidak bisa
 *    broadcast langsung. Mereka publish ke channel Redis; proses web berlangganan
 *    dan meneruskannya ke room admin. Tanpa Redis, jalur web tetap live dan
 *    worker jatuh ke senyap — bukan crash.
 * 3. **Tanpa isi pesan.** Yang dikirim hanya bentuk eksekusi: node mana, berapa
 *    lama, berhasil atau tidak. Isi percakapan keuangan user tidak pernah lewat
 *    sini.
 */

import type Redis from "ioredis";
import { redis } from "@/lib/redis";
import { getSocketServer } from "@/lib/socket-server";
import { ADMIN_ROOM } from "@/lib/admin-realtime";

export const AGENT_EVENT_CHANNEL = "ledgerly:agent:events";

/** Cukup untuk mengisi konsol saat halaman dibuka, tanpa jadi log permanen. */
export const AGENT_RUN_BUFFER = 60;
const RUN_BUFFER_KEY = "ledgerly:agent:runs";

export type AgentRunTrack = "chat" | "heartbeat";

export type AgentTelemetryEvent =
  | {
      type: "run:start";
      runId: string;
      track: AgentRunTrack;
      channel: string;
      at: string;
    }
  | {
      type: "node";
      runId: string;
      /** Id node di graph, supaya kanvas tahu kotak mana yang harus berkedip. */
      nodeId: string;
      kind: string;
      status: "running" | "ok" | "skipped" | "error";
      ms?: number;
      /** Ringkasan sangat pendek, mis. "3 tool" — tidak pernah isi pesan user. */
      detail?: string;
      at: string;
    }
  | {
      type: "run:end";
      runId: string;
      status: "ok" | "error";
      ms: number;
      /** Nama tool yang dijalankan; berguna untuk menelusuri run yang aneh. */
      toolsUsed?: string[];
      at: string;
    };

/**
 * Id run yang stabil tanpa bergantung pada crypto khusus runtime.
 *
 * Cukup unik untuk mengelompokkan event dalam satu jendela konsol; ini bukan
 * kunci basis data.
 */
export function newRunId(): string {
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function broadcastLocally(event: AgentTelemetryEvent) {
  const io = getSocketServer();
  if (!io) return false;
  io.to(ADMIN_ROOM).emit("agent:event", event);
  return true;
}

/**
 * Menyiarkan satu event. Tidak pernah melempar, tidak pernah menahan pemanggil.
 *
 * Proses yang punya server socket menyiarkan langsung; proses worker menitipkan
 * lewat Redis. Keduanya sama-sama menulis ke ring buffer supaya halaman yang
 * baru dibuka tidak menampilkan kanvas kosong.
 */
export function emitAgentEvent(event: AgentTelemetryEvent): void {
  void (async () => {
    try {
      const deliveredLocally = broadcastLocally(event);
      if (!redis) return;

      const payload = JSON.stringify(event);
      const pipeline = redis.multi().lpush(RUN_BUFFER_KEY, payload).ltrim(RUN_BUFFER_KEY, 0, AGENT_RUN_BUFFER - 1);
      // Proses web sudah menyiarkan sendiri; publish ulang hanya akan membuat
      // event yang sama muncul dua kali di konsol yang sama.
      if (!deliveredLocally) pipeline.publish(AGENT_EVENT_CHANNEL, payload);
      await pipeline.exec();
    } catch {
      // Telemetri tidak boleh punya suara dalam nasib sebuah run.
    }
  })();
}

/** Event terakhir, terbaru dulu. Dipakai untuk render awal konsol run. */
export async function readRecentAgentEvents(limit = AGENT_RUN_BUFFER): Promise<AgentTelemetryEvent[]> {
  if (!redis) return [];
  try {
    const raw = await redis.lrange(RUN_BUFFER_KEY, 0, Math.max(0, limit - 1));
    return raw
      .map((entry) => {
        try {
          return JSON.parse(entry) as AgentTelemetryEvent;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is AgentTelemetryEvent => entry !== null);
  } catch {
    return [];
  }
}

/**
 * Menyambungkan channel Redis ke room admin. Dipanggil sekali dari server.ts.
 *
 * Subscriber memakai koneksi terpisah karena koneksi ioredis yang sudah masuk
 * mode subscribe tidak boleh lagi menjalankan perintah biasa — dan `redis` yang
 * diekspor dipakai di seluruh aplikasi untuk cache dan riwayat percakapan.
 */
export function startAgentTelemetryBridge(): void {
  if (!redis) return;
  if (globalThis.__ledgerlyAgentBridge) return;

  const subscriber = redis.duplicate();
  globalThis.__ledgerlyAgentBridge = subscriber;

  subscriber.on("error", (err: Error) => {
    console.warn("[agent-telemetry] jembatan Redis bermasalah:", err.message);
  });

  subscriber.subscribe(AGENT_EVENT_CHANNEL).catch((err: Error) => {
    console.warn("[agent-telemetry] gagal berlangganan:", err.message);
  });

  subscriber.on("message", (channel: string, payload: string) => {
    if (channel !== AGENT_EVENT_CHANNEL) return;
    try {
      broadcastLocally(JSON.parse(payload) as AgentTelemetryEvent);
    } catch {
      // Payload rusak dari proses lain tidak boleh menjatuhkan server web.
    }
  });
}

declare global {
  // eslint-disable-next-line no-var
  var __ledgerlyAgentBridge: Redis | undefined;
}
