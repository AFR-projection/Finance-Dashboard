/**
 * Bukti bahwa kanvas menggerakkan jalur heartbeat, bukan cuma jalur chat.
 *
 * tick.test.ts sudah membuktikan penjadwal berperilaku seperti dulu saat belum
 * ada graph tersimpan. File ini membuktikan sisi sebaliknya: mengubah node
 * Penjadwal / Analis / Kirim Laporan benar-benar mengubah apa yang dijadwalkan
 * dan apa yang dikirim.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findManySettings: vi.fn(),
  claimCreate: vi.fn(),
  claimUpdate: vi.fn(),
  claimDeleteMany: vi.fn(),
  requireAiAccess: vi.fn(),
  collectSnapshot: vi.fn(),
  analyzeHeartbeat: vi.fn(),
  dispatchHeartbeat: vi.fn(),
  exportTransactionsCsv: vi.fn(),
  loadHeartbeatPlan: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    userSettings: { findMany: mocks.findManySettings },
    heartbeatRun: {
      create: mocks.claimCreate,
      update: mocks.claimUpdate,
      deleteMany: mocks.claimDeleteMany,
    },
  },
}));
vi.mock("@/ai/entitlement", () => ({ requireAiAccess: mocks.requireAiAccess }));
vi.mock("@/ai/resolve-config", () => ({
  resolveAiConfig: vi
    .fn()
    .mockResolvedValue({ provider: "OPENROUTER", model: "test/model", apiKey: "key" }),
}));
vi.mock("@/ai/graph/store", () => ({ loadHeartbeatPlan: mocks.loadHeartbeatPlan }));
vi.mock("@/finance-engine/export", () => ({
  exportTransactionsCsv: mocks.exportTransactionsCsv,
}));
vi.mock("./signals", () => ({ collectSnapshot: mocks.collectSnapshot }));
vi.mock("./analyst", () => ({ analyzeHeartbeat: mocks.analyzeHeartbeat }));
vi.mock("./dispatch", () => ({ dispatchHeartbeat: mocks.dispatchHeartbeat }));

import { compileGraph } from "@/ai/graph/compile";
import { buildDefaultGraph } from "@/ai/graph/default-graph";
import type { HeartbeatPlan } from "@/ai/graph/compile";
import { tickHeartbeat } from "./scheduler";

/** 2026-08-04 07:30 Jakarta — Selasa, lewat jam heartbeat. Jadwal harian. */
const DAILY_AT = new Date("2026-08-04T00:30:00Z");
/** 2026-08-03 07:30 Jakarta — Senin. Jadwal pekanan. */
const MONDAY_AT = new Date("2026-08-03T00:30:00Z");
/** 2026-08-01 07:30 Jakarta — tanggal 1. Jadwal tutup bulan. */
const FIRST_AT = new Date("2026-08-01T00:30:00Z");

function planWith(patch: (plan: HeartbeatPlan) => HeartbeatPlan): HeartbeatPlan {
  const base = compileGraph(buildDefaultGraph()).heartbeat!;
  return patch(structuredClone(base));
}

function claimedCadence(): string | undefined {
  return mocks.claimCreate.mock.calls[0]?.[0]?.data?.cadence;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findManySettings.mockResolvedValue([
    { userId: "u1", timezone: "Asia/Jakarta", heartbeatHour: 7 },
  ]);
  mocks.claimDeleteMany.mockResolvedValue({ count: 0 });
  mocks.claimCreate.mockResolvedValue({ id: "run1" });
  mocks.claimUpdate.mockResolvedValue({});
  mocks.requireAiAccess.mockResolvedValue({});
  mocks.collectSnapshot.mockResolvedValue({ cadence: "daily" });
  mocks.analyzeHeartbeat.mockResolvedValue({
    ok: true,
    analysis: { shouldSend: true, title: "Judul", body: "Isi", severity: "info", actions: [] },
  });
  mocks.dispatchHeartbeat.mockResolvedValue({
    saved: true,
    telegram: 1,
    push: 0,
    document: false,
  });
  mocks.exportTransactionsCsv.mockResolvedValue({
    filename: "rekap.csv",
    csv: "a,b",
    rowCount: 3,
    totals: [{ currency: "IDR", income: 1, expense: 2 }],
  });
  mocks.loadHeartbeatPlan.mockResolvedValue(planWith((p) => p));
});

describe("node Penjadwal", () => {
  it("berhenti menjadwalkan sama sekali saat ketiga cadence dimatikan", async () => {
    mocks.loadHeartbeatPlan.mockResolvedValue(
      planWith((p) => ({
        ...p,
        schedule: { ...p.schedule, daily: false, weekly: false, monthly: false },
      })),
    );

    await tickHeartbeat(DAILY_AT);

    expect(mocks.claimCreate).not.toHaveBeenCalled();
    expect(mocks.collectSnapshot).not.toHaveBeenCalled();
  });

  it("tetap menjadwalkan brief harian saat hanya rekap pekanan yang dimatikan", async () => {
    mocks.loadHeartbeatPlan.mockResolvedValue(
      planWith((p) => ({ ...p, schedule: { ...p.schedule, weekly: false } })),
    );

    await tickHeartbeat(MONDAY_AT);

    // Inti perbaikannya: cadence yang dimatikan tidak boleh membuat hari itu
    // senyap total, harus turun ke cadence di bawahnya.
    expect(claimedCadence()).toBe("daily");
  });

  it("turun ke rekap pekanan saat tanggal 1 jatuh di hari Senin dan laporan bulanan dimatikan", async () => {
    mocks.loadHeartbeatPlan.mockResolvedValue(
      planWith((p) => ({ ...p, schedule: { ...p.schedule, monthly: false } })),
    );

    // 2026-06-01 adalah hari Senin.
    await tickHeartbeat(new Date("2026-06-01T00:30:00Z"));

    expect(claimedCadence()).toBe("weekly");
  });

  it("memakai jam cadangan dari node saat jam tersimpan user di luar rentang", async () => {
    mocks.findManySettings.mockResolvedValue([
      { userId: "u1", timezone: "Asia/Jakarta", heartbeatHour: 99 },
    ]);
    mocks.loadHeartbeatPlan.mockResolvedValue(
      planWith((p) => ({ ...p, schedule: { ...p.schedule, defaultHour: 7 } })),
    );

    await tickHeartbeat(DAILY_AT);

    expect(claimedCadence()).toBe("daily");
  });

  it("tidak menimpa jam pilihan user dengan jam cadangan", async () => {
    mocks.findManySettings.mockResolvedValue([
      { userId: "u1", timezone: "Asia/Jakarta", heartbeatHour: 9 },
    ]);
    mocks.loadHeartbeatPlan.mockResolvedValue(
      planWith((p) => ({ ...p, schedule: { ...p.schedule, defaultHour: 5 } })),
    );

    await tickHeartbeat(DAILY_AT);

    expect(mocks.claimCreate).not.toHaveBeenCalled();
  });
});

describe("node Analis LLM", () => {
  it("meneruskan temperature dan model khusus ke analis", async () => {
    mocks.loadHeartbeatPlan.mockResolvedValue(
      planWith((p) => ({
        ...p,
        analyst: { ...p.analyst, modelOverride: "khusus/model", temperature: 0.9 },
      })),
    );

    await tickHeartbeat(DAILY_AT);

    expect(mocks.analyzeHeartbeat).toHaveBeenCalledWith(
      expect.objectContaining({
        analyst: expect.objectContaining({ modelOverride: "khusus/model", temperature: 0.9 }),
      }),
    );
  });

  // Tick heartbeat mengerjakan user berurutan dalam satu proses, jadi batas
  // waktu di sini bukan kenyamanan — ia yang mencegah satu user yang macet
  // menahan giliran semua user berikutnya.
  it("meneruskan batas waktu dan percobaan ulang ke analis", async () => {
    mocks.loadHeartbeatPlan.mockResolvedValue(
      planWith((p) => ({
        ...p,
        analyst: { ...p.analyst, requestTimeoutMs: 12_000, maxRetries: 4, totalBudgetMs: 30_000 },
      })),
    );

    await tickHeartbeat(DAILY_AT);

    expect(mocks.analyzeHeartbeat).toHaveBeenCalledWith(
      expect.objectContaining({
        analyst: expect.objectContaining({
          requestTimeoutMs: 12_000,
          maxRetries: 4,
          totalBudgetMs: 30_000,
        }),
      }),
    );
  });
});

describe("node Kirim Laporan", () => {
  it("meneruskan kanal yang dimatikan ke dispatch", async () => {
    mocks.loadHeartbeatPlan.mockResolvedValue(
      planWith((p) => ({ ...p, dispatch: { ...p.dispatch, telegram: false } })),
    );

    await tickHeartbeat(DAILY_AT);

    expect(mocks.dispatchHeartbeat).toHaveBeenCalledWith(
      expect.objectContaining({ channels: { telegram: false, webPush: true } }),
    );
  });

  it("mencatat channels-disabled, bukan no-channel, saat semua kanal dimatikan admin", async () => {
    mocks.loadHeartbeatPlan.mockResolvedValue(
      planWith((p) => ({ ...p, dispatch: { ...p.dispatch, telegram: false, webPush: false } })),
    );
    mocks.dispatchHeartbeat.mockResolvedValue({
      saved: true,
      telegram: 0,
      push: 0,
      document: false,
    });

    await tickHeartbeat(DAILY_AT);

    // Admin yang membaca riwayat run harus bisa membedakan salah konfigurasi
    // platform dari user yang memang belum menautkan kanal apa pun.
    expect(mocks.claimUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SAVED", reason: "channels-disabled" }),
      }),
    );
  });

  it("tidak membangun rekap CSV saat lampiran bulanan dimatikan", async () => {
    mocks.collectSnapshot.mockResolvedValue({ cadence: "monthly" });
    mocks.loadHeartbeatPlan.mockResolvedValue(
      planWith((p) => ({ ...p, dispatch: { ...p.dispatch, monthlyAttachment: false } })),
    );

    await tickHeartbeat(FIRST_AT);

    expect(claimedCadence()).toBe("monthly");
    // Export ini membaca seluruh transaksi sebulan; mematikan lampiran harus
    // benar-benar melewatinya, bukan membuatnya lalu membuang hasilnya.
    expect(mocks.exportTransactionsCsv).not.toHaveBeenCalled();
    expect(mocks.dispatchHeartbeat).toHaveBeenCalledWith(
      expect.objectContaining({ attachment: undefined }),
    );
  });

  it("tetap membangun rekap CSV saat lampiran bulanan menyala", async () => {
    mocks.collectSnapshot.mockResolvedValue({ cadence: "monthly" });

    await tickHeartbeat(FIRST_AT);

    expect(mocks.exportTransactionsCsv).toHaveBeenCalled();
  });
});
