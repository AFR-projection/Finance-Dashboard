import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/ai/usage", () => ({ recordAiUsage: vi.fn() }));

import { analyzeHeartbeat, DEFAULT_ANALYST_SETTINGS } from "./analyst";
import type { HeartbeatSnapshot } from "./signals";

const ANALYST = DEFAULT_ANALYST_SETTINGS;

const SNAPSHOT = { cadence: "daily" } as unknown as HeartbeatSnapshot;
const CONFIG = {
  provider: "OPENROUTER" as const,
  model: "test/primary",
  apiKey: "key",
  fallbackModels: ["test/fallback"],
};

/** Balasan OpenRouter yang sukses secara HTTP, dengan `content` apa adanya. */
function reply(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
  } as unknown as Response;
}

function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn();
  for (const res of responses) fetchMock.mockResolvedValueOnce(res);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("analyzeHeartbeat", () => {
  // Bug produksi: model menjawab dengan benar bahwa tidak ada yang layak
  // dikirim, parser menolaknya karena title/body kosong, seluruh rantai
  // fallback ikut dicoba, dan hasilnya tercatat "all-models-failed" — lalu
  // periode hari itu hangus. Panggilan LLM-nya sukses dan tetap ditagih.
  it("menerima keputusan 'tidak ada yang layak dikirim' tanpa title dan body", async () => {
    const fetchMock = stubFetch(reply(JSON.stringify({ shouldSend: false })));

    const result = await analyzeHeartbeat({ snapshot: SNAPSHOT, config: CONFIG });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.analysis.shouldSend).toBe(false);
    // Satu panggilan saja: tidak ada alasan mencoba fallback untuk jawaban benar.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("tetap menolak balasan tanpa isi saat model mengaku ada yang perlu dikirim", async () => {
    stubFetch(
      reply(JSON.stringify({ shouldSend: true })),
      reply(JSON.stringify({ shouldSend: true })),
      reply(JSON.stringify({ shouldSend: true })),
      reply(JSON.stringify({ shouldSend: true })),
    );

    const result = await analyzeHeartbeat({ snapshot: SNAPSHOT, config: CONFIG });

    expect(result.ok).toBe(false);
  });

  // `response_format` adalah satu-satunya beda struktural dengan jalur chat yang
  // terbukti jalan dengan model yang sama.
  it("mengulang model yang sama tanpa mode JSON saat isinya tidak bisa diparse", async () => {
    const fetchMock = stubFetch(
      reply(""),
      reply(JSON.stringify({ shouldSend: true, title: "Judul", body: "Isi" })),
    );

    const result = await analyzeHeartbeat({ snapshot: SNAPSHOT, config: CONFIG });

    expect(result.ok).toBe(true);
    const first = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    const second = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(first.model).toBe("test/primary");
    expect(first.response_format).toEqual({ type: "json_object" });
    expect(second.model).toBe("test/primary");
    expect(second.response_format).toBeUndefined();
  });

  // Tanpa ini kegagalan hanya meninggalkan dua kata di kolom `reason`, dan
  // penjelasannya cuma ada di stdout container.
  it("membawa pesan asli tiap percobaan ke dalam detail", async () => {
    stubFetch(
      { ok: false, status: 402, text: async () => "insufficient credits" } as unknown as Response,
      { ok: false, status: 402, text: async () => "insufficient credits" } as unknown as Response,
    );

    const result = await analyzeHeartbeat({ snapshot: SNAPSHOT, config: CONFIG });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("all-models-failed");
      expect(result.detail).toContain("402");
      expect(result.detail).toContain("insufficient credits");
      expect(result.detail).toContain("test/fallback");
    }
  });

  // Tick heartbeat mengerjakan user berurutan dalam satu proses. Tanpa batas
  // total, satu user dengan penyedia yang lambat menahan giliran semua user
  // berikutnya sekaligus menghentikan tulisan liveness yang dibaca /system.
  it("berhenti menyapu rantai model begitu batas waktu total habis", async () => {
    const fetchMock = stubFetch();

    const result = await analyzeHeartbeat({
      snapshot: SNAPSHOT,
      config: CONFIG,
      analyst: { ...ANALYST, totalBudgetMs: 0 },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail).toContain("batas waktu total");
  });

  it("tidak memanggil penyedia sama sekali tanpa API key", async () => {
    const fetchMock = stubFetch();

    const result = await analyzeHeartbeat({
      snapshot: SNAPSHOT,
      config: { ...CONFIG, apiKey: "" },
    });

    expect(result).toEqual({ ok: false, reason: "no-api-key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
