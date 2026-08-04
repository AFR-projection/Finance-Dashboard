-- Penanda hasil tiap siklus heartbeat.
--
-- Sebelumnya duplikat dijaga dengan mencari baris "ai_insights" ber-period_key.
-- Baris itu hanya lahir kalau siklusnya sukses penuh, jadi setiap hasil skip
-- (user FREE, tidak ada API key, model gagal, atau analis memutuskan tidak ada
-- yang layak dikirim) tidak meninggalkan jejak sama sekali. Tick berikutnya —
-- 60 detik kemudian — mengulang seluruh pengumpulan sinyal dan panggilan LLM
-- untuk user yang sama, selamanya.
--
-- Tabel ini ditulis untuk SETIAP hasil, jadi keputusan "tidak mengirim" pun
-- hanya diambil sekali per periode. Sekaligus jadi sumber riwayat panel admin
-- dan dasar probe kesehatan.

-- RUNNING dipakai untuk meng-"claim" periode secara atomik lewat unique index
-- (user_id, period_key) sebelum pekerjaan dimulai. Dua proses worker yang hidup
-- bersamaan jadi tidak mungkin menjalankan siklus yang sama, dan run yang mati
-- di tengah jalan tetap kelihatan alih-alih hilang tanpa jejak.
CREATE TYPE "HeartbeatStatus" AS ENUM ('RUNNING', 'SENT', 'SAVED', 'SKIPPED', 'FAILED');

CREATE TABLE "heartbeat_runs" (
    "id"          TEXT NOT NULL,
    "user_id"     TEXT NOT NULL,
    "period_key"  TEXT NOT NULL,
    "cadence"     TEXT NOT NULL,
    "status"      "HeartbeatStatus" NOT NULL,
    "reason"      TEXT,
    "started_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,

    CONSTRAINT "heartbeat_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "heartbeat_runs_user_id_period_key_key"
  ON "heartbeat_runs"("user_id", "period_key");
CREATE INDEX "heartbeat_runs_started_at_idx" ON "heartbeat_runs"("started_at");

ALTER TABLE "heartbeat_runs" ADD CONSTRAINT "heartbeat_runs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill dari insight yang sudah ada.
--
-- Tanpa ini, tick pertama sesudah worker akhirnya hidup akan melihat tabel
-- kosong dan mengirim ulang brief untuk periode yang sudah pernah dikirim.
--
-- Hanya period_key berprefiks yang diambil: "daily:" / "weekly:" / "monthly:"
-- adalah milik heartbeat, sedangkan /api/insights memakai format "2026-08"
-- tanpa prefiks untuk keperluan lain dan tidak boleh ikut menekan heartbeat.
INSERT INTO "heartbeat_runs" ("id", "user_id", "period_key", "cadence", "status", "reason", "started_at", "finished_at")
SELECT
    gen_random_uuid()::text,
    i."user_id",
    i."period_key",
    split_part(i."period_key", ':', 1),
    'SAVED'::"HeartbeatStatus",
    'backfill-dari-ai-insights',
    MIN(i."created_at"),
    MIN(i."created_at")
FROM "ai_insights" i
WHERE i."period_key" LIKE 'daily:%'
   OR i."period_key" LIKE 'weekly:%'
   OR i."period_key" LIKE 'monthly:%'
GROUP BY i."user_id", i."period_key"
ON CONFLICT ("user_id", "period_key") DO NOTHING;
