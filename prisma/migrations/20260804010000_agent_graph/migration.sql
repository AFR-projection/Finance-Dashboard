-- Pipeline AI agent disimpan sebagai data supaya bisa diubah tanpa deploy.
--
-- Sebelumnya seluruh orkestrasi agent adalah konstanta di src/ai/agent.ts:
-- batas putaran, batas panggilan tool, temperature, daftar tool, blok konteks,
-- dan guard. Mengubah salah satunya berarti deploy ulang.
--
-- Draft dipisah dari yang dipublish dengan sengaja. Admin yang sedang menggeser
-- node di kanvas tidak boleh mengubah perilaku agent yang saat itu juga sedang
-- melayani user; perubahan baru berlaku ketika ditekan Publish.

CREATE TABLE "agent_graph" (
    "id"           TEXT NOT NULL DEFAULT 'singleton',
    "version"      INTEGER NOT NULL DEFAULT 0,
    "nodes"        JSONB NOT NULL DEFAULT '[]',
    "edges"        JSONB NOT NULL DEFAULT '[]',
    "draftNodes"   JSONB,
    "draftEdges"   JSONB,
    "published_at" TIMESTAMP(3),
    "updated_by"   TEXT,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_graph_pkey" PRIMARY KEY ("id")
);

-- Riwayat tiap publish. Bukan relasi ke users: jejak perubahan harus selamat
-- kalau akun admin yang melakukannya dihapus.
CREATE TABLE "agent_graph_revisions" (
    "id"            TEXT NOT NULL,
    "version"       INTEGER NOT NULL,
    "nodes"         JSONB NOT NULL,
    "edges"         JSONB NOT NULL,
    "actor_user_id" TEXT,
    "actor_name"    TEXT,
    "note"          TEXT,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_graph_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_graph_revisions_version_key" ON "agent_graph_revisions"("version");
CREATE INDEX "agent_graph_revisions_created_at_idx" ON "agent_graph_revisions"("created_at");
