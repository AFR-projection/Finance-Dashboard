/**
 * Mengunci perilaku runtime agent APA ADANYA sebelum dipecah jadi engine graph.
 *
 * Ini bukan test yang menyatakan perilakunya ideal — ini jaring pengaman. Jalur
 * ini menulis transaksi uang sungguhan, dan beberapa perilakunya ada justru
 * untuk mencegah double-write. Kalau refactor mengubah salah satunya tanpa
 * sengaja, test ini yang harus berteriak.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  executeToolsParallel: vi.fn(),
  loadHistory: vi.fn(),
  appendHistory: vi.fn(),
  recordAiUsage: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("./tool-executor", () => ({ executeToolsParallel: mocks.executeToolsParallel }));
vi.mock("./conversation-store", () => ({
  loadHistory: mocks.loadHistory,
  appendHistory: mocks.appendHistory,
}));
vi.mock("./usage", () => ({ recordAiUsage: mocks.recordAiUsage }));
vi.mock("@/lib/db", () => ({
  prisma: {
    aiMemory: { findMany: vi.fn().mockResolvedValue([]) },
    userSettings: { findUnique: vi.fn().mockResolvedValue(null) },
    transaction: { findMany: vi.fn().mockResolvedValue([]) },
    financialGoal: { count: vi.fn().mockResolvedValue(0) },
    aiInsight: { findMany: vi.fn().mockResolvedValue([]) },
    // Belum ada graph tersimpan — kondisi instalasi baru. Justru inilah yang
    // harus diuji: tanpa satu pun sentuhan di Agent Studio, runtime wajib
    // berperilaku persis seperti sebelum kanvas ada.
    agentGraph: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

import { runFinanceAgent } from "./agent";

const CONFIG = { provider: "OPENROUTER" as const, model: "test/model", apiKey: "key" };

function assistantWithTools(...calls: Array<{ id: string; name: string; args: unknown }>) {
  return {
    role: "assistant",
    content: null,
    tool_calls: calls.map((c) => ({
      id: c.id,
      type: "function",
      function: { name: c.name, arguments: JSON.stringify(c.args) },
    })),
  };
}

function queueReplies(...replies: Array<Record<string, unknown>>) {
  for (const message of replies) {
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message }] }),
    });
  }
  const last = replies[replies.length - 1];
  mocks.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: last }] }),
  });
}

/** Hasil createTransaction yang lolos verifikasi mutasi, lengkap dengan resi. */
function writeResult(id: string, walletName: string, receipt: string) {
  return {
    __clientMessage: receipt,
    __verifiedMutation: { kind: "transaction.created", entityId: id, walletName },
  };
}

function bodyOf(callIndex: number) {
  const call = mocks.fetch.mock.calls[callIndex];
  return JSON.parse((call[1] as { body: string }).body);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.loadHistory.mockResolvedValue([]);
  mocks.appendHistory.mockResolvedValue(undefined);
  mocks.executeToolsParallel.mockResolvedValue([]);
});

describe("bentuk permintaan ke provider", () => {
  // Ketiganya jadi knob yang bisa diatur dari kanvas. Nilai defaultnya harus
  // tetap sama persis supaya graph bawaan tidak diam-diam mengubah perilaku.
  it("mengirim temperature 0.2, tool_choice auto, dan daftar tool lengkap", async () => {
    queueReplies({ role: "assistant", content: "Halo." });

    await runFinanceAgent({ userId: "u1", message: "halo", config: CONFIG, channel: "WEB" });

    const body = bodyOf(0);
    expect(body.temperature).toBe(0.2);
    expect(body.tool_choice).toBe("auto");
    expect(body.model).toBe("test/model");
    expect(Array.isArray(body.tools)).toBe(true);
    expect(body.tools.length).toBeGreaterThan(20);
  });

  it("menempatkan system prompt lalu riwayat lalu pesan user", async () => {
    mocks.loadHistory.mockResolvedValue([
      { role: "user", content: "sebelumnya" },
      { role: "assistant", content: "jawaban lama" },
    ]);
    queueReplies({ role: "assistant", content: "Halo." });

    await runFinanceAgent({ userId: "u1", message: "halo", config: CONFIG, channel: "WEB" });

    const messages = bodyOf(0).messages;
    expect(messages[0].role).toBe("system");
    expect(messages[1].content).toBe("sebelumnya");
    expect(messages[2].content).toBe("jawaban lama");
    expect(messages[3]).toEqual({ role: "user", content: "halo" });
  });
});

describe("pengaman biaya pada tool", () => {
  it("memblokir panggilan tool yang identik alih-alih menjalankannya dua kali", async () => {
    queueReplies(
      assistantWithTools({ id: "c1", name: "getTransactions", args: { limit: 5 } }),
      assistantWithTools({ id: "c2", name: "getTransactions", args: { limit: 5 } }),
      { role: "assistant", content: "Selesai." },
    );
    mocks.executeToolsParallel.mockResolvedValue([{ result: { rows: [] } }]);

    await runFinanceAgent({ userId: "u1", message: "lihat transaksi", config: CONFIG, channel: "WEB" });

    // Dijalankan sekali saja; putaran kedua diberi pesan penolakan, bukan eksekusi.
    expect(mocks.executeToolsParallel).toHaveBeenCalledTimes(2);
    expect(mocks.executeToolsParallel.mock.calls[1][1]).toEqual([]);

    const secondRoundTool = bodyOf(2).messages.find(
      (m: { role: string; tool_call_id?: string }) => m.role === "tool" && m.tool_call_id === "c2",
    );
    expect(JSON.parse(secondRoundTool.content).error).toContain("identik");
  });
});

describe("alur penulisan transaksi", () => {
  // Optimasi biaya yang mudah hilang saat refactor: resi dari tool sudah
  // otoritatif, jadi tidak perlu membayar satu putaran model lagi yang malah
  // bisa memparafrasekan fakta yang sudah tersimpan secara keliru.
  it("mengembalikan resi langsung tanpa putaran model tambahan", async () => {
    const receipt = "✅ Pengeluaran tercatat di BCA\nRp25.000 • Kopi";
    queueReplies(
      assistantWithTools({ id: "c1", name: "createTransaction", args: { amount: 25000 } }),
    );
    mocks.executeToolsParallel.mockResolvedValue([{ result: writeResult("t1", "BCA", receipt) }]);

    const reply = await runFinanceAgent({
      userId: "u1",
      message: "beli kopi 25 ribu",
      config: CONFIG,
      channel: "WEB",
    });

    expect(reply.text).toBe(receipt);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("mengembalikan semua draft yang menunggu pilihan rekening, bukan hanya yang pertama", async () => {
    queueReplies(
      assistantWithTools(
        { id: "c1", name: "createTransaction", args: { amount: 1390 } },
        { id: "c2", name: "createTransaction", args: { amount: 6500 } },
      ),
    );
    const prompt = (id: string) => ({
      __walletPrompt: { question: `Rekening untuk ${id}?`, pendingId: id, options: [] },
    });
    mocks.executeToolsParallel.mockResolvedValue([
      { result: prompt("p1") },
      { result: prompt("p2") },
    ]);

    const reply = await runFinanceAgent({
      userId: "u1",
      message: "taxi 1.39, makan 6.50",
      config: CONFIG,
      channel: "WEB",
    });

    expect(reply.walletPrompts).toHaveLength(2);
    expect(reply.walletPrompt).toBe(reply.walletPrompts?.[0]);
  });
});

describe("kegagalan provider", () => {
  // Pengaman uang paling penting di file ini. Tool sudah menulis ke database;
  // mencoba model cadangan akan menjalankan seluruh putaran itu lagi dan
  // mencatat transaksi yang sama dua kali.
  it("TIDAK mencoba model cadangan setelah sebuah tool berhasil dijalankan", async () => {
    const config = { ...CONFIG, fallbackModels: ["cadangan/satu", "cadangan/dua"] };
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: assistantWithTools({ id: "c1", name: "createTransaction", args: {} }) }],
      }),
    });
    mocks.fetch.mockRejectedValue(new Error("provider meledak"));
    mocks.executeToolsParallel.mockResolvedValue([{ result: { ok: true } }]);

    const reply = await runFinanceAgent({
      userId: "u1",
      message: "catat 10rb",
      config,
      channel: "WEB",
    });

    expect(mocks.executeToolsParallel).toHaveBeenCalledTimes(1);
    // Yang dijaga adalah MODEL-nya, bukan jumlah panggilannya: putus jaringan
    // diulang pada model yang sama (permintaan identik, belum tentu sampai ke
    // penyedia), tapi tidak satu pun percobaan boleh mendarat di model cadangan
    // — di situlah seluruh putaran, termasuk tool tulisnya, akan dijalankan ulang.
    const models = mocks.fetch.mock.calls.map((_, i) => bodyOf(i).model);
    expect(new Set(models)).toEqual(new Set(["test/model"]));
    expect(reply.text).toContain("Periksa dashboard");
  });

  it("berpindah ke model cadangan saat gagal sebelum ada tool yang jalan", async () => {
    const config = { ...CONFIG, fallbackModels: ["cadangan/satu"] };
    // 400 = permintaannya yang ditolak model ini, bukan gangguan sementara.
    // Mengulanginya sia-sia, jadi rantai fallback langsung dipakai.
    mocks.fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "model tidak dikenal",
    });
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { role: "assistant", content: "Halo." } }] }),
    });

    const reply = await runFinanceAgent({ userId: "u1", message: "halo", config, channel: "WEB" });

    expect(reply.text).toBe("Halo.");
    expect(bodyOf(1).model).toBe("cadangan/satu");
  });

  // Perilaku baru, dan bedanya nyata: dulu satu 503 sesaat langsung menurunkan
  // percakapan ke model cadangan yang lebih lemah untuk sisa jawabannya.
  it("mengulang model utama dulu sebelum menyerah ke model cadangan", async () => {
    const config = { ...CONFIG, fallbackModels: ["cadangan/satu"] };
    mocks.fetch.mockResolvedValueOnce({ ok: false, status: 503, text: async () => "sibuk" });
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { role: "assistant", content: "Halo." } }] }),
    });

    const reply = await runFinanceAgent({ userId: "u1", message: "halo", config, channel: "WEB" });

    expect(reply.text).toBe("Halo.");
    expect(bodyOf(1).model).toBe("test/model");
  });

  it("menyerah dengan pesan aman saat semua model gagal", async () => {
    mocks.fetch.mockRejectedValue(new Error("semua mati"));

    const reply = await runFinanceAgent({ userId: "u1", message: "halo", config: CONFIG, channel: "WEB" });

    expect(reply.text).toContain("Data Anda tidak diubah");
    expect(reply.toolsUsed).toEqual([]);
  });
});

describe("pencatatan token", () => {
  it("menjumlahkan pemakaian lintas putaran dan melaporkannya sekali", async () => {
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: assistantWithTools({ id: "c1", name: "getTransactions", args: {} }) }],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      }),
    });
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: "assistant", content: "Selesai." } }],
        usage: { prompt_tokens: 50, completion_tokens: 10 },
      }),
    });
    mocks.executeToolsParallel.mockResolvedValue([{ result: { rows: [] } }]);

    const reply = await runFinanceAgent({
      userId: "u1",
      message: "lihat transaksi",
      config: CONFIG,
      channel: "WEB",
    });

    expect(reply.usage).toEqual({ promptTokens: 150, outputTokens: 30, model: "test/model" });
    expect(mocks.recordAiUsage).toHaveBeenCalledTimes(1);
    expect(mocks.recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ source: "CHAT", userId: "u1" }),
    );
  });

  it("menyimpan giliran percakapan ke riwayat setelah menjawab", async () => {
    queueReplies({ role: "assistant", content: "Halo." });

    await runFinanceAgent({ userId: "u1", message: "halo", config: CONFIG, channel: "WEB" });

    expect(mocks.appendHistory).toHaveBeenCalledWith(
      "u1",
      "WEB",
      [
        { role: "user", content: "halo" },
        { role: "assistant", content: "Halo." },
      ],
      // Batas ini kini datang dari node "Riwayat Percakapan". Angkanya wajib
      // sama dengan konstanta lama di conversation-store.ts (MAX_TURNS = 10,
      // TTL_SECONDS = 60*60*6), jadi graph bawaan tidak mengubah apa pun.
      { maxTurns: 10, ttlHours: 6 },
    );
  });
});
