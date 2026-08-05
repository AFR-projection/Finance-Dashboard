/**
 * Urutan katalog = urutan tahap.
 *
 * Kanvas admin tidak boleh mengimpor file ini — katalog menarik seluruh registry
 * tool ke dalam bundle browser — jadi yang sampai ke sana cuma array
 * `NODE_DEFINITION_LIST` sebagai data biasa. Dari array itulah kanvas menyimpulkan
 * tetangga sebuah node saat admin memasang tahap baru: node dipasang di antara
 * kerabat terdekat yang peringkatnya lebih rendah dan lebih tinggi.
 *
 * Kesimpulan itu hanya sah selama urutan katalog searah dengan `PHASE_RANK`, yang
 * dipakai `validateGraph` untuk menolak edge mundur. Kalau suatu hari ada yang
 * memindahkan satu definisi ke atas "supaya rapi", kanvas akan menyambungkan node
 * baru ke tempat yang langsung ditolak validasi — dan tidak ada satu pun tipe yang
 * menangkapnya. Test ini yang menangkapnya.
 */

import { describe, expect, it } from "vitest";
import { NODE_DEFINITION_LIST } from "./catalogue";
import { PHASE_RANK } from "./compile";
import { AGENT_TRACKS } from "./types";

describe("urutan katalog", () => {
  it.each(AGENT_TRACKS)("naik searah dengan PHASE_RANK di jalur %s", (track) => {
    const ranks = NODE_DEFINITION_LIST.filter((definition) => definition.track === track).map(
      (definition) => PHASE_RANK[definition.kind],
    );

    expect(ranks.length).toBeGreaterThan(0);
    for (let i = 1; i < ranks.length; i += 1) {
      // Sama peringkat boleh (riwayat percakapan vs konteks keuangan memang
      // bisa ditukar bebas); yang dilarang cuma turun.
      expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]);
    }
  });

  it("tidak menaruh dua jalur berselang-seling", () => {
    // Kanvas mengelompokkan daftar node per jalur dengan sekali filter, dan
    // penyisipan otomatis hanya melihat node sejalur. Keduanya tetap benar kalau
    // urutannya berselang, tapi daftar yang melompat-lompat antar jalur adalah
    // tanda katalog sedang disusun tanpa niat — jadi ditahan di sini.
    const tracks = NODE_DEFINITION_LIST.map((definition) => definition.track);
    const blocks = tracks.filter((track, index) => index === 0 || track !== tracks[index - 1]);
    expect(blocks).toEqual([...new Set(blocks)]);
  });
});
