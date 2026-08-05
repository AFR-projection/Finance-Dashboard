/**
 * Merapikan kanvas jadi kolom berlapis mengikuti arah aliran.
 *
 * Graph ini punya siklus yang sah — node penalaran dan eksekutor tool saling
 * memanggil sampai batas putaran habis — jadi penyusun lapisan berbasis urutan
 * topologis murni akan berputar selamanya di situ. Yang dipakai di sini
 * relaksasi berulang dengan batas keras sebanyak jumlah node: setiap node
 * didorong ke kanan pendahulunya sampai posisinya tidak berubah lagi, dan siklus
 * berhenti sendiri saat batasnya tercapai alih-alih menggantung tab.
 *
 * Dua jalur (chat dan laporan proaktif) ditumpuk vertikal, bukan disebar dalam
 * satu bidang. Keduanya tidak pernah terhubung satu sama lain, dan mencampurnya
 * dalam satu deretan kolom membuat dua rantai berbeda terbaca seperti satu.
 */

import type { AgentGraphData, AgentNode, NodeDefinition } from "./shared";

/**
 * Jarak antar kolom. Kartu selebar 248px + ruang untuk garis dan panahnya.
 *
 * Diekspor karena penyisipan node di tengah rantai memakai jarak yang sama untuk
 * menggeser sisa kolom ke kanan — kalau angkanya berbeda, hasil sisipan langsung
 * tidak sejajar dengan hasil "Rapikan".
 */
export const COLUMN_GAP = 316;
/** Jarak antar baris dalam satu kolom. Kartu tertinggi ±150px + napas. */
export const ROW_GAP = 176;
/** Jarak vertikal antara blok jalur chat dan blok jalur proaktif. */
const TRACK_GAP = 128;
const ORIGIN = { x: 40, y: 40 };

export function autoLayout(
  graph: AgentGraphData,
  definitions: Map<string, NodeDefinition>,
): AgentGraphData {
  const trackOf = (node: AgentNode) => definitions.get(node.kind)?.track ?? "chat";
  const positions = new Map<string, { x: number; y: number }>();
  let cursorY = ORIGIN.y;

  for (const track of ["chat", "heartbeat"] as const) {
    const nodes = graph.nodes.filter((node) => trackOf(node) === track);
    if (nodes.length === 0) continue;

    const ids = new Set(nodes.map((node) => node.id));
    // Hanya edge di dalam jalur yang sama yang menentukan kolom; edge yang
    // menyeberang jalur (kalau ada, lewat tangan admin) diabaikan supaya tidak
    // mendorong seluruh blok proaktif ke kolom kedua puluh.
    const edges = graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));

    const depth = new Map<string, number>(nodes.map((node) => [node.id, 0]));
    for (let pass = 0; pass < nodes.length; pass += 1) {
      let moved = false;
      for (const edge of edges) {
        const next = (depth.get(edge.source) ?? 0) + 1;
        if (next > (depth.get(edge.target) ?? 0)) {
          depth.set(edge.target, next);
          moved = true;
        }
      }
      if (!moved) break;
    }

    // Node dikelompokkan per kolom, urutannya mengikuti urutan di graph supaya
    // hasilnya stabil: menekan "Rapikan" dua kali memberi susunan yang sama.
    const columns = new Map<number, AgentNode[]>();
    for (const node of nodes) {
      const column = depth.get(node.id) ?? 0;
      const bucket = columns.get(column);
      if (bucket) bucket.push(node);
      else columns.set(column, [node]);
    }

    const tallest = Math.max(...[...columns.values()].map((bucket) => bucket.length));
    for (const [column, bucket] of columns) {
      // Kolom pendek dipusatkan terhadap kolom terpanjang, jadi rantainya terbaca
      // sebagai satu garis mendatar alih-alih tangga yang menempel ke atas.
      const offset = ((tallest - bucket.length) * ROW_GAP) / 2;
      bucket.forEach((node, row) => {
        positions.set(node.id, {
          x: ORIGIN.x + column * COLUMN_GAP,
          y: cursorY + offset + row * ROW_GAP,
        });
      });
    }

    cursorY += tallest * ROW_GAP + TRACK_GAP;
  }

  return {
    nodes: graph.nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position })),
    edges: graph.edges,
  };
}
