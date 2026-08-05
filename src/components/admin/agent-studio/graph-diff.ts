/**
 * Apa persisnya yang berubah antara graph yang sedang dipublish dan draft.
 *
 * Alasan modul ini ada: Publish adalah satu-satunya tombol di halaman ini yang
 * langsung mengubah perilaku agent yang sedang melayani user, dan sebelumnya ia
 * hanya dijaga `window.confirm` yang berbunyi "yakin?". Pertanyaan itu tidak bisa
 * dijawab dengan jujur tanpa tahu isi perubahannya — apalagi kalau draft-nya
 * ditinggal setengah jadi kemarin sore.
 *
 * Perpindahan posisi dipisahkan dari sisanya dengan sengaja. Menggeser kotak
 * tidak mengubah satu byte pun yang dibaca runtime, jadi ia tidak boleh tampil
 * sejajar dengan "temperature 0.4 → 1.2" dan membuat daftar perubahan penting
 * tenggelam di antara belasan baris kosmetik.
 */

import type { AgentGraphData, AgentNode, NodeDefinition } from "./shared";

export type GraphChange =
  | { kind: "added"; nodeId: string; label: string }
  | { kind: "removed"; nodeId: string; label: string }
  | { kind: "toggled"; nodeId: string; label: string; enabled: boolean }
  | { kind: "renamed"; nodeId: string; label: string; from: string; to: string }
  | { kind: "config"; nodeId: string; label: string; field: string; from: string; to: string }
  | { kind: "edge"; nodeId: string; label: string; added: boolean };

export type GraphDiff = {
  changes: GraphChange[];
  /** Jumlah node yang hanya berpindah tempat. Dilaporkan sebagai satu baris, bukan satu per node. */
  moved: number;
  /** True kalau tidak ada satu pun perubahan yang menyentuh runtime. */
  cosmeticOnly: boolean;
};

export function diffGraphs(
  published: AgentGraphData,
  draft: AgentGraphData,
  definitions: Map<string, NodeDefinition>,
): GraphDiff {
  const before = new Map(published.nodes.map((node) => [node.id, node]));
  const after = new Map(draft.nodes.map((node) => [node.id, node]));
  const changes: GraphChange[] = [];
  let moved = 0;

  const nameOf = (node: AgentNode) =>
    node.label?.trim() || definitions.get(node.kind)?.label || node.kind;

  for (const [id, node] of after) {
    const old = before.get(id);
    if (!old) {
      changes.push({ kind: "added", nodeId: id, label: nameOf(node) });
      continue;
    }

    const label = nameOf(node);

    if (old.enabled !== node.enabled) {
      changes.push({ kind: "toggled", nodeId: id, label, enabled: node.enabled });
    }

    const oldName = nameOf(old);
    if (oldName !== label) {
      changes.push({ kind: "renamed", nodeId: id, label, from: oldName, to: label });
    }

    const fields = definitions.get(node.kind)?.fields ?? [];
    for (const field of fields) {
      const from = old.config[field.key];
      const to = node.config[field.key];
      if (sameValue(from, to)) continue;
      changes.push({
        kind: "config",
        nodeId: id,
        label,
        field: field.label,
        from: describe(from),
        to: describe(to),
      });
    }

    // Dihitung terakhir supaya node yang juga berubah config tidak ikut dihitung
    // dua kali — yang penting sudah dilaporkan di atas.
    if (
      Math.round(old.position.x) !== Math.round(node.position.x) ||
      Math.round(old.position.y) !== Math.round(node.position.y)
    ) {
      moved += 1;
    }
  }

  for (const [id, node] of before) {
    if (!after.has(id)) changes.push({ kind: "removed", nodeId: id, label: nameOf(node) });
  }

  const edgeKey = (edge: { source: string; target: string }) => `${edge.source}→${edge.target}`;
  const beforeEdges = new Set(published.edges.map(edgeKey));
  const afterEdges = new Set(draft.edges.map(edgeKey));
  const edgeLabel = (key: string) =>
    key
      .split("→")
      .map((id) => {
        const node = after.get(id) ?? before.get(id);
        return node ? nameOf(node) : id;
      })
      .join(" → ");

  for (const key of afterEdges) {
    if (!beforeEdges.has(key)) changes.push({ kind: "edge", nodeId: key, label: edgeLabel(key), added: true });
  }
  for (const key of beforeEdges) {
    if (!afterEdges.has(key)) changes.push({ kind: "edge", nodeId: key, label: edgeLabel(key), added: false });
  }

  return { changes, moved, cosmeticOnly: changes.length === 0 && moved > 0 };
}

/** Perbandingan yang menganggap dua array dengan isi sama sebagai sama, apa pun urutannya. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const left = [...a].map(String).sort();
    const right = [...b].map(String).sort();
    return left.every((value, index) => value === right[index]);
  }
  return a === b;
}

/**
 * Nilai config sebagai teks pendek yang bisa dibaca manusia.
 *
 * Daftar panjang (mis. 26 tool yang dicentang) diringkas jadi jumlahnya: yang
 * ingin diketahui admin saat hendak publish adalah "26 → 24", bukan 26 nama yang
 * memenuhi seluruh dialog.
 */
function describe(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "boolean") return value ? "aktif" : "mati";
  if (Array.isArray(value)) {
    if (value.length === 0) return "kosong";
    if (value.length <= 3) return value.join(", ");
    return `${value.length} item`;
  }
  const text = String(value);
  return text.trim() === "" ? "kosong" : text.length > 40 ? `${text.slice(0, 40)}…` : text;
}
