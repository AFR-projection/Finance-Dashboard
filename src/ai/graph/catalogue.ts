/**
 * Katalog tipe node — satu-satunya sumber kebenaran.
 *
 * Setiap nilai `default` di file ini WAJIB sama persis dengan konstanta yang
 * dulu di-hardcode di runtime. Itu yang membuat DEFAULT_GRAPH menghasilkan
 * perilaku identik dengan sebelum ada kanvas: kalau tidak ada yang menyentuh
 * Agent Studio, tidak ada yang berubah. Angka asalnya ditulis di komentar tiap
 * field supaya kalau salah satu bergeser, ketahuan dari mana harusnya.
 */

import { agentTools } from "../tools";
import type { AgentNodeKind, NodeDefinition } from "./types";

const TOOL_OPTIONS = agentTools.map((tool) => ({
  value: tool.name,
  label: tool.name,
  description: tool.description,
}));

const ALL_TOOL_NAMES = agentTools.map((tool) => tool.name as string);

export const NODE_DEFINITIONS: Record<AgentNodeKind, NodeDefinition> = {
  // ─── Jalur chat ────────────────────────────────────────────────────────────
  "trigger.chat": {
    kind: "trigger.chat",
    track: "chat",
    label: "Pesan Masuk",
    description: "Titik masuk saat user mengirim pesan lewat web atau Telegram.",
    icon: "MessageSquare",
    accent: "trigger",
    hasInput: false,
    hasOutput: true,
    required: true,
    singleton: true,
    fields: [
      {
        key: "channels",
        label: "Kanal yang dilayani",
        type: "multiselect",
        default: ["WEB", "TELEGRAM"],
        options: [
          { value: "WEB", label: "Web" },
          { value: "TELEGRAM", label: "Telegram" },
        ],
        hint: "Kanal yang tidak dicentang akan menerima balasan penolakan singkat.",
      },
    ],
  },

  "context.loader": {
    kind: "context.loader",
    track: "chat",
    label: "Konteks Keuangan",
    description:
      "Merangkai saldo, budget, proyeksi, goal, memori, dan transaksi terakhir jadi konteks untuk model.",
    icon: "Database",
    accent: "context",
    hasInput: true,
    hasOutput: true,
    required: false,
    singleton: true,
    fields: [
      { key: "wallets", label: "Saldo rekening", type: "toggle", default: true },
      { key: "budget", label: "Budget berjalan", type: "toggle", default: true },
      { key: "prediction", label: "Proyeksi akhir bulan", type: "toggle", default: true },
      { key: "goals", label: "Target keuangan", type: "toggle", default: true },
      { key: "insights", label: "Insight proaktif terakhir", type: "toggle", default: true },
      { key: "memories", label: "Preferensi & catatan", type: "toggle", default: true },
      { key: "recentTransactions", label: "Transaksi terakhir", type: "toggle", default: true },
      {
        // agent.ts: prisma.aiMemory.findMany take 60
        key: "memoryLimit",
        label: "Jumlah memori diambil",
        type: "number",
        default: 60,
        min: 0,
        max: 200,
        hint: "Disaring lagi oleh rankMemories sebelum masuk prompt.",
      },
      {
        // agent.ts: prisma.transaction.findMany take 12
        key: "transactionLimit",
        label: "Jumlah transaksi terakhir",
        type: "number",
        default: 12,
        min: 0,
        max: 50,
      },
      {
        // agent.ts: prisma.aiInsight.findMany take 3
        key: "insightLimit",
        label: "Jumlah insight terakhir",
        type: "number",
        default: 3,
        min: 0,
        max: 20,
        hint: "Dipakai agar agent tidak mengulang pesan proaktif yang baru dikirim.",
      },
    ],
  },

  "memory.conversation": {
    kind: "memory.conversation",
    track: "chat",
    label: "Riwayat Percakapan",
    description: "Menyimpan giliran percakapan sebelumnya agar agent ingat konteks obrolan.",
    icon: "History",
    accent: "context",
    hasInput: true,
    hasOutput: true,
    required: false,
    singleton: true,
    fields: [
      {
        // conversation-store.ts: MAX_TURNS = 10
        key: "maxTurns",
        label: "Giliran yang diingat",
        type: "number",
        default: 10,
        min: 0,
        max: 40,
        hint: "Satu giliran = satu pesan user + satu balasan agent.",
      },
      {
        // conversation-store.ts: TTL_SECONDS = 60 * 60 * 6
        key: "ttlHours",
        label: "Umur riwayat (jam)",
        type: "number",
        default: 6,
        min: 1,
        max: 168,
      },
    ],
  },

  "policy.intent": {
    kind: "policy.intent",
    track: "chat",
    label: "Kebijakan Intent",
    description:
      "Membaca maksud pesan secara deterministik, lalu memaksa tool baca dijalankan sebelum model boleh menyebut angka.",
    icon: "Crosshair",
    accent: "guard",
    hasInput: true,
    hasOutput: true,
    required: false,
    singleton: true,
    fields: [
      {
        key: "forceReadTool",
        label: "Paksa tool baca saat pertanyaan uang",
        type: "toggle",
        default: true,
        hint: "Mematikan ini membuat model boleh menjawab pertanyaan saldo tanpa membaca data.",
      },
    ],
  },

  "llm.reasoner": {
    kind: "llm.reasoner",
    track: "chat",
    label: "Penalaran LLM",
    description: "Putaran model yang memilih tool dan menyusun jawaban akhir.",
    icon: "BrainCircuit",
    accent: "reason",
    hasInput: true,
    hasOutput: true,
    required: true,
    singleton: true,
    fields: [
      {
        key: "modelOverride",
        label: "Model khusus (opsional)",
        type: "text",
        default: "",
        placeholder: "kosongkan = pakai model platform",
        hint: "Model utama & fallback platform diatur di halaman AI & Model.",
      },
      {
        // agent.ts: temperature: 0.2
        key: "temperature",
        label: "Temperature",
        type: "number",
        default: 0.2,
        min: 0,
        max: 2,
        step: 0.05,
      },
      {
        // agent.ts: MAX_AGENT_ROUNDS = 6
        key: "maxRounds",
        label: "Batas putaran",
        type: "number",
        default: 6,
        min: 1,
        max: 12,
        hint: "Satu putaran = satu panggilan model. Habis batas, agent menjawab dari data yang ada.",
      },
      {
        key: "useFallbackModels",
        label: "Pakai model cadangan saat gagal",
        type: "toggle",
        default: true,
      },
    ],
  },

  "tools.executor": {
    kind: "tools.executor",
    track: "chat",
    label: "Eksekutor Tool",
    description: "Menjalankan tool yang dipilih model, secara paralel dalam satu putaran.",
    icon: "Wrench",
    accent: "act",
    hasInput: true,
    hasOutput: true,
    required: false,
    singleton: true,
    fields: [
      {
        key: "enabledTools",
        label: "Tool yang aktif",
        type: "multiselect",
        default: ALL_TOOL_NAMES,
        options: TOOL_OPTIONS,
        hint: "Tool yang dimatikan tidak dikirim ke model, jadi tidak mungkin dipanggil.",
      },
      {
        // agent.ts: MAX_TOOL_CALLS = 30
        key: "maxToolCalls",
        label: "Batas panggilan tool per pesan",
        type: "number",
        default: 30,
        min: 1,
        max: 100,
        hint: "Cukup untuk satu batch dikte belanja sehari tanpa membiarkan model berputar.",
      },
      {
        key: "dedupeIdenticalCalls",
        label: "Blokir panggilan identik berulang",
        type: "toggle",
        default: true,
        hint: "Mencegah transaksi yang sama tercatat dua kali saat model berputar.",
      },
    ],
  },

  "guard.grounding": {
    kind: "guard.grounding",
    track: "chat",
    label: "Guard Kebenaran",
    description:
      "Menyaring balasan terhadap apa yang benar-benar dikembalikan tool — prosa model bukan bukti.",
    icon: "ShieldCheck",
    accent: "guard",
    hasInput: true,
    hasOutput: true,
    required: false,
    singleton: true,
    fields: [
      {
        key: "enforceWriteClaim",
        label: "Tolak klaim 'sudah tercatat' tanpa bukti tulis",
        type: "toggle",
        default: true,
      },
      {
        key: "enforceGroundedFigures",
        label: "Tolak angka yang tidak berasal dari tool",
        type: "toggle",
        default: true,
      },
    ],
  },

  "dispatch.reply": {
    kind: "dispatch.reply",
    track: "chat",
    label: "Balasan",
    description: "Mengirim jawaban akhir kembali ke kanal asal pesan.",
    icon: "Send",
    accent: "output",
    hasInput: true,
    hasOutput: false,
    required: true,
    singleton: true,
    fields: [],
  },

  // ─── Jalur heartbeat ───────────────────────────────────────────────────────
  "trigger.schedule": {
    kind: "trigger.schedule",
    track: "heartbeat",
    label: "Penjadwal",
    description: "Memicu laporan proaktif saat jam lokal user melewati jam yang disetel.",
    icon: "AlarmClock",
    accent: "trigger",
    hasInput: false,
    hasOutput: true,
    required: true,
    singleton: true,
    fields: [
      {
        key: "defaultHour",
        label: "Jam cadangan (waktu lokal user)",
        type: "number",
        default: 7,
        min: 0,
        max: 23,
        hint: "Jam pilihan user selalu menang. Ini hanya dipakai kalau nilai tersimpannya di luar rentang 0–23.",
      },
      { key: "daily", label: "Brief harian", type: "toggle", default: true },
      { key: "weekly", label: "Rekap Senin", type: "toggle", default: true },
      { key: "monthly", label: "Laporan tutup bulan", type: "toggle", default: true },
    ],
  },

  "signals.collect": {
    kind: "signals.collect",
    track: "heartbeat",
    label: "Kumpul Sinyal",
    description: "Mengumpulkan angka keuangan mentah yang jadi satu-satunya sumber bagi analis.",
    icon: "Activity",
    accent: "context",
    hasInput: true,
    hasOutput: true,
    required: true,
    singleton: true,
    fields: [],
  },

  "llm.analyst": {
    kind: "llm.analyst",
    track: "heartbeat",
    label: "Analis LLM",
    description:
      "Menyusun brief proaktif, dan boleh memutuskan hari ini tidak layak mengganggu user.",
    icon: "Sparkles",
    accent: "reason",
    hasInput: true,
    hasOutput: true,
    required: true,
    singleton: true,
    fields: [
      {
        key: "modelOverride",
        label: "Model khusus (opsional)",
        type: "text",
        default: "",
        placeholder: "kosongkan = pakai model platform",
      },
      {
        // analyst.ts: temperature: 0.4
        key: "temperature",
        label: "Temperature",
        type: "number",
        default: 0.4,
        min: 0,
        max: 2,
        step: 0.05,
      },
    ],
  },

  "dispatch.notify": {
    kind: "dispatch.notify",
    track: "heartbeat",
    label: "Kirim Laporan",
    description: "Menyimpan insight lalu mengantarkannya ke kanal yang ditautkan user.",
    icon: "BellRing",
    accent: "output",
    hasInput: true,
    hasOutput: false,
    required: true,
    singleton: true,
    fields: [
      { key: "telegram", label: "Kirim ke Telegram", type: "toggle", default: true },
      { key: "webPush", label: "Kirim web push", type: "toggle", default: true },
      {
        key: "monthlyAttachment",
        label: "Lampirkan rekap CSV bulanan",
        type: "toggle",
        default: true,
        hint: "Hanya untuk laporan tutup bulan, dan dilewati kalau bulan itu tidak ada transaksi.",
      },
    ],
  },
};

export const NODE_DEFINITION_LIST = Object.values(NODE_DEFINITIONS);

export function definitionFor(kind: AgentNodeKind): NodeDefinition {
  return NODE_DEFINITIONS[kind];
}

export { ALL_TOOL_NAMES };
