"use client";

/**
 * Riwayat undo/redo untuk kanvas.
 *
 * Snapshot diambil dari `AgentGraphData` — bentuk yang sama yang dikirim ke
 * server — bukan dari node React Flow. Node membawa keadaan turunan (status run
 * live, penanda invalid, ukuran hasil pengukuran) yang berubah tanpa admin
 * menyentuh apa pun; menyimpannya berarti tiap kedip event masuk jadi satu
 * langkah undo, dan tombol Undo akan mengembalikan waktu, bukan pekerjaan.
 *
 * Perekaman ditunda: menggeser satu node menghasilkan puluhan perubahan posisi
 * per detik, dan tiap pixel bukan langkah yang layak dibatalkan sendiri. Jeda
 * `SETTLE_MS` menggabungkan satu gerakan utuh jadi satu entri.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { sameGraph, type AgentGraphData } from "./shared";

/** Sedikit lebih pendek dari autosave, supaya yang tersimpan sudah tercatat dulu. */
const SETTLE_MS = 900;

/** Batas tumpukan. Cukup dalam untuk satu sesi penyuntingan, tidak menahan graph lama di memori tanpa batas. */
const MAX_DEPTH = 50;

export type GraphHistory = {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  /** Dipanggil saat graph diganti dari luar (muat bawaan, publish, rollback) supaya riwayat tidak bercampur. */
  reset: (graph: AgentGraphData) => void;
};

export function useGraphHistory(
  graph: AgentGraphData,
  apply: (graph: AgentGraphData) => void,
): GraphHistory {
  const past = useRef<AgentGraphData[]>([]);
  const future = useRef<AgentGraphData[]>([]);
  const present = useRef<AgentGraphData>(graph);

  // Menandai bahwa perubahan graph berikutnya datang dari undo/redo itu sendiri,
  // jadi tidak boleh direkam ulang — tanpa ini, undo mendorong keadaan lamanya
  // kembali ke tumpukan dan tombol Redo tidak pernah menyala.
  const replaying = useRef(false);

  /**
   * Kedalaman tumpukan sebagai state, isinya sebagai ref.
   *
   * Tumpukannya sendiri tidak boleh jadi state: `undo` harus membaca puncak yang
   * paling akhir, dan state yang dibaca dari closure bisa tertinggal satu render
   * kalau dua penekanan tombol jatuh dalam satu batch. Yang dibutuhkan render
   * hanyalah dua angka ini — cukup untuk menyalakan dan mematikan tombolnya.
   */
  const [depth, setDepth] = useState({ past: 0, future: 0 });
  const refresh = useCallback(() => {
    setDepth({ past: past.current.length, future: future.current.length });
  }, []);

  useEffect(() => {
    if (replaying.current) {
      replaying.current = false;
      present.current = graph;
      return;
    }
    if (sameGraph(graph, present.current)) return;

    const timer = setTimeout(() => {
      if (sameGraph(graph, present.current)) return;
      past.current = [...past.current, present.current].slice(-MAX_DEPTH);
      present.current = graph;
      // Menyunting sesudah undo membuang cabang masa depan — perilaku yang sama
      // dengan editor mana pun, dan satu-satunya yang tidak menghasilkan riwayat
      // bercabang yang tak bisa digambarkan dengan dua tombol.
      future.current = [];
      refresh();
    }, SETTLE_MS);

    return () => clearTimeout(timer);
  }, [graph, refresh]);

  const undo = useCallback(() => {
    const previous = past.current.at(-1);
    if (!previous) return;
    past.current = past.current.slice(0, -1);
    future.current = [present.current, ...future.current].slice(0, MAX_DEPTH);
    present.current = previous;
    replaying.current = true;
    apply(previous);
    refresh();
  }, [apply, refresh]);

  const redo = useCallback(() => {
    const next = future.current[0];
    if (!next) return;
    future.current = future.current.slice(1);
    past.current = [...past.current, present.current].slice(-MAX_DEPTH);
    present.current = next;
    replaying.current = true;
    apply(next);
    refresh();
  }, [apply, refresh]);

  const reset = useCallback(
    (next: AgentGraphData) => {
      past.current = [];
      future.current = [];
      present.current = next;
      replaying.current = true;
      refresh();
    },
    [refresh],
  );

  return {
    canUndo: depth.past > 0,
    canRedo: depth.future > 0,
    undo,
    redo,
    reset,
  };
}
