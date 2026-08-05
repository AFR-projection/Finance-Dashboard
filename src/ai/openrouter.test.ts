import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callOpenRouter, setRetrySleeper } from "./openrouter";

/**
 * Jeda direkam, bukan ditunggu: yang perlu dibuktikan adalah berapa lama
 * transport MEMUTUSKAN untuk menunggu, bukan bahwa `setTimeout` bekerja.
 */
const slept: number[] = [];

const BASE = { apiKey: "key", title: "Test", body: { model: "m" } };

function json(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload } as unknown as Response;
}

function fail(status: number, text = "meledak", headers?: Record<string, string>) {
  return {
    ok: false,
    status,
    text: async () => text,
    headers: { get: (k: string) => headers?.[k.toLowerCase()] ?? null },
  } as unknown as Response;
}

function stubFetch(...responses: Response[]) {
  const mock = vi.fn();
  for (const res of responses) mock.mockResolvedValueOnce(res);
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(() => {
  slept.length = 0;
  setRetrySleeper(async (ms) => {
    slept.push(ms);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("callOpenRouter", () => {
  it("mengembalikan badan respons apa adanya saat berhasil", async () => {
    stubFetch(json({ choices: [{ message: { content: "halo" } }] }));

    const result = await callOpenRouter(BASE);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.attempts).toBe(1);
      expect(result.json).toEqual({ choices: [{ message: { content: "halo" } }] });
    }
  });

  // Inti alasan file ini ada. Sebelumnya 429 sesaat langsung dianggap "model
  // ini gagal", lalu rantai fallback pindah ke model yang lebih lemah.
  it("mengulang 429 pada model yang sama lalu berhasil", async () => {
    const fetchMock = stubFetch(fail(429), json({ ok: 1 }));

    const result = await callOpenRouter(BASE);

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(slept).toHaveLength(1);
  });

  it("mengulang 502 dan putus jaringan, tapi menyerah sesudah batas percobaan", async () => {
    const fetchMock = stubFetch(fail(502), fail(503), fail(500), fail(500));

    const result = await callOpenRouter({ ...BASE, maxRetries: 2 });

    expect(result.ok).toBe(false);
    // Satu percobaan awal + dua ulangan. Yang keempat tidak pernah dikirim.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    if (!result.ok) expect(result.attempts).toBe(3);
  });

  // Mengulang permintaan yang memang salah cuma menunda pesan error yang benar,
  // dan untuk 402 tetap tidak menambah saldo.
  it("TIDAK mengulang kegagalan yang bukan gangguan sementara", async () => {
    const fetchMock = stubFetch(fail(402, "insufficient credits"));

    const result = await callOpenRouter(BASE);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(402);
      expect(result.retryable).toBe(false);
      expect(result.error).toContain("insufficient credits");
    }
  });

  it("menuruti Retry-After alih-alih backoff sendiri", async () => {
    stubFetch(fail(429, "slow down", { "retry-after": "3" }), json({ ok: 1 }));

    await callOpenRouter(BASE);

    expect(slept).toEqual([3000]);
  });

  // Penyedia kadang meminta ratusan detik. Menurutinya berarti satu tick
  // heartbeat berhenti lima menit — periode yang gagal toh dijadwalkan ulang.
  it("membatasi Retry-After yang tidak masuk akal", async () => {
    stubFetch(fail(429, "slow down", { "retry-after": "600" }), json({ ok: 1 }));

    await callOpenRouter(BASE);

    expect(slept).toEqual([20_000]);
  });

  it("berhenti mencoba begitu batas waktu total terlampaui", async () => {
    const fetchMock = stubFetch(fail(503), fail(503), fail(503));

    const result = await callOpenRouter({
      ...BASE,
      maxRetries: 5,
      deadlineAt: Date.now() - 1, // sudah lewat sebelum panggilan pertama
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("batas waktu total");
  });

  it("memberi setiap panggilan sinyal batas waktu", async () => {
    const fetchMock = stubFetch(json({ ok: 1 }));

    await callOpenRouter({ ...BASE, timeoutMs: 9_000 });

    const init = fetchMock.mock.calls[0][1] as { signal?: AbortSignal };
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  // 200 dengan badan terpotong hampir selalu proxy yang memutus stream di
  // tengah — bentuk gangguan yang justru paling layak diulang.
  it("memperlakukan badan respons yang rusak sebagai gangguan sementara", async () => {
    const fetchMock = stubFetch(
      {
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("Unexpected end of JSON input");
        },
      } as unknown as Response,
      json({ ok: 1 }),
    );

    const result = await callOpenRouter(BASE);

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
