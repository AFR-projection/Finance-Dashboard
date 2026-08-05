/**
 * Uji coba — menjalankan draft tanpa menyentuh data.
 *
 * Graph yang diuji dimuat dari server: draft kalau ada, kalau tidak yang sedang
 * dipublish. Tombol "Uji coba" di kanvas menyimpan draft lebih dulu sebelum
 * pindah ke sini, jadi yang diuji selalu susunan yang barusan dilihat admin —
 * bukan versi lama yang kebetulan masih tersimpan.
 */

import { Wand2 } from "lucide-react";
import { readGraphRecord } from "@/ai/graph/store";
import { TestPanel } from "@/components/admin/agent-studio/test-panel";
import { PageHeader, Panel, PanelHeader, Tone } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AdminAgentTestPage() {
  const record = await readGraphRecord();
  const graph = record.draft ?? record.published;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Uji coba"
        description="Kirim satu pesan contoh lewat susunan yang sedang disunting, lalu baca jawabannya. Jejak per node-nya muncul di halaman Eksekusi seperti run biasa."
      />

      <Panel className="overflow-hidden">
        <PanelHeader
          title="Pesan contoh"
          hint={`${graph.nodes.length} node · ${graph.edges.length} sambungan`}
          icon={Wand2}
          actions={
            record.draft ? (
              <Tone tone="warning">draft belum dipublish</Tone>
            ) : (
              <Tone tone="positive">{record.version === 0 ? "bawaan" : `v${record.version}`}</Tone>
            )
          }
        />
        <TestPanel graph={graph} />
      </Panel>
    </div>
  );
}
