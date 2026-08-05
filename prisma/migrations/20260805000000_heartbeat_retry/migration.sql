-- Bukti kegagalan dan percobaan ulang untuk siklus heartbeat.
--
-- Sebelum ini sebuah siklus yang gagal hanya meninggalkan dua kata di kolom
-- "reason" — mis. "all-models-failed" — sementara pesan asli penyedia cuma ada
-- di stdout container. Di VPS itu praktis berarti tidak ada. Admin melihat
-- kegagalan tapi tidak punya satu pun petunjuk penyebabnya.
--
-- Lebih buruk lagi: klaim periode ditulis sebelum pekerjaan dimulai dan unique
-- index (user_id, period_key) membuatnya permanen. Satu gangguan penyedia jam 7
-- pagi menghanguskan seluruh hari itu — memperbaiki konfigurasinya jam 8 tidak
-- menghasilkan apa pun sampai besok. "attempts" yang membuat pelepasan klaim
-- untuk kegagalan transien tetap punya ujung: penyebab permanen berhenti
-- mengulang alih-alih membakar kuota sepanjang hari.

ALTER TABLE "heartbeat_runs" ADD COLUMN "detail" TEXT;
ALTER TABLE "heartbeat_runs" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 1;
