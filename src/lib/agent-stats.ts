/**
 * Angka-angka yang dipajang di rail metrik Agent Studio.
 *
 * Aturan yang mengikat file ini: **tidak ada angka tanpa sumber.** Setiap field
 * di `AgentStats` bisa ditunjuk ke satu tabel. Rail yang menampilkan indikator
 * yang selalu hijau lebih buruk daripada rail yang kosong — yang kosong jujur,
 * yang selalu hijau membuat orang berhenti memeriksa.
 *
 * Latensi sengaja TIDAK dihitung di sini. Ia hidup di buffer telemetri Redis
 * yang sudah dialirkan ke kanvas secara realtime, jadi menghitungnya lagi di
 * server berarti dua sumber kebenaran untuk angka yang sama — dan yang di server
 * akan selalu tertinggal beberapa detik dari yang di layar.
 */

import { prisma } from "@/lib/db";

/** Jendela pengamatan. Sehari penuh: cukup untuk melihat pola, cukup pendek untuk terasa "sekarang". */
export const STATS_WINDOW_HOURS = 24;

/** Berapa model teratas yang muat di rail tanpa membuatnya bergulir. */
const TOP_MODELS = 4;

export type AgentStats = {
  windowHours: number;
  /** Panggilan LLM per sumber. Chat dibayar kuota user, heartbeat dibayar platform. */
  calls: { chat: number; heartbeat: number };
  tokens: { prompt: number; output: number };
  /** Model yang benar-benar melayani, bukan yang dikonfigurasi — keduanya bisa berbeda saat fallback jalan. */
  models: Array<{ model: string; calls: number; tokens: number }>;
  heartbeat: { sent: number; saved: number; skipped: number; failed: number };
  /** User berbeda yang dilayani dalam jendela ini. */
  users: number;
  /** Panggilan per jam, 24 keranjang, terlama dulu. Bahan sparkline. */
  series: number[];
  generatedAt: string;
};

export const EMPTY_STATS: AgentStats = {
  windowHours: STATS_WINDOW_HOURS,
  calls: { chat: 0, heartbeat: 0 },
  tokens: { prompt: 0, output: 0 },
  models: [],
  heartbeat: { sent: 0, saved: 0, skipped: 0, failed: 0 },
  users: 0,
  series: Array<number>(STATS_WINDOW_HOURS).fill(0),
  generatedAt: new Date(0).toISOString(),
};

export async function readAgentStats(): Promise<AgentStats> {
  const since = new Date(Date.now() - STATS_WINDOW_HOURS * 3_600_000);

  try {
    const [bySource, byModel, distinctUsers, heartbeat, buckets] = await Promise.all([
      prisma.aiUsageLog.groupBy({
        by: ["source"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { promptTokens: true, outputTokens: true },
      }),
      prisma.aiUsageLog.groupBy({
        by: ["model"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { promptTokens: true, outputTokens: true },
        orderBy: { _count: { model: "desc" } },
        take: TOP_MODELS,
      }),
      prisma.aiUsageLog.findMany({
        where: { createdAt: { gte: since } },
        distinct: ["userId"],
        select: { userId: true },
      }),
      prisma.heartbeatRun.groupBy({
        by: ["status"],
        where: { startedAt: { gte: since } },
        _count: { _all: true },
      }),
      hourlyBuckets(since),
    ]);

    const chat = bySource.find((row) => row.source === "CHAT");
    const beat = bySource.find((row) => row.source === "HEARTBEAT");
    const countOf = (status: string) =>
      heartbeat.find((row) => row.status === status)?._count._all ?? 0;

    return {
      windowHours: STATS_WINDOW_HOURS,
      calls: {
        chat: chat?._count._all ?? 0,
        heartbeat: beat?._count._all ?? 0,
      },
      tokens: {
        prompt: bySource.reduce((sum, row) => sum + (row._sum.promptTokens ?? 0), 0),
        output: bySource.reduce((sum, row) => sum + (row._sum.outputTokens ?? 0), 0),
      },
      models: byModel.map((row) => ({
        model: row.model,
        calls: row._count._all,
        tokens: (row._sum.promptTokens ?? 0) + (row._sum.outputTokens ?? 0),
      })),
      heartbeat: {
        sent: countOf("SENT"),
        saved: countOf("SAVED"),
        skipped: countOf("SKIPPED"),
        failed: countOf("FAILED"),
      },
      users: distinctUsers.length,
      series: buckets,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    // Rail yang gagal memuat tidak boleh menjatuhkan seluruh halaman: kanvas dan
    // kemampuan publish adalah alasan utama halaman ini ada, metrik pelengkapnya.
    console.error("[agent-stats] gagal menghitung:", error);
    return { ...EMPTY_STATS, generatedAt: new Date().toISOString() };
  }
}

/**
 * Panggilan per jam untuk sparkline.
 *
 * Lewat SQL mentah karena `groupBy` Prisma tidak bisa mengelompokkan timestamp ke
 * dalam ember waktu — alternatifnya menarik seluruh baris 24 jam ke memori hanya
 * untuk membaginya jadi 24 angka.
 */
async function hourlyBuckets(since: Date): Promise<number[]> {
  const rows = await prisma.$queryRaw<Array<{ bucket: Date; calls: bigint }>>`
    SELECT date_trunc('hour', created_at) AS bucket, COUNT(*) AS calls
    FROM ai_usage_log
    WHERE created_at >= ${since}
    GROUP BY 1
  `;

  const counts = new Map<number, number>();
  for (const row of rows) {
    counts.set(new Date(row.bucket).setMinutes(0, 0, 0), Number(row.calls));
  }

  // Keranjang dibuat dari jam sekarang mundur, lalu dibalik: jam tanpa satu pun
  // panggilan harus tetap muncul sebagai nol, bukan hilang dari deret.
  const now = new Date().setMinutes(0, 0, 0);
  const series: number[] = [];
  for (let index = STATS_WINDOW_HOURS - 1; index >= 0; index -= 1) {
    series.push(counts.get(now - index * 3_600_000) ?? 0);
  }
  return series;
}
