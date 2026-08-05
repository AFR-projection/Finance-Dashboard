import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findManySettings: vi.fn(),
  claimCreate: vi.fn(),
  claimUpdate: vi.fn(),
  claimUpdateMany: vi.fn(),
  claimFindUnique: vi.fn(),
  claimDeleteMany: vi.fn(),
  requireAiAccess: vi.fn(),
  collectSnapshot: vi.fn(),
  analyzeHeartbeat: vi.fn(),
  dispatchHeartbeat: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    userSettings: { findMany: mocks.findManySettings },
    heartbeatRun: {
      create: mocks.claimCreate,
      update: mocks.claimUpdate,
      updateMany: mocks.claimUpdateMany,
      findUnique: mocks.claimFindUnique,
      deleteMany: mocks.claimDeleteMany,
    },
    // Belum ada graph tersimpan: penjadwal wajib jalan dengan aturan bawaan.
    agentGraph: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));
vi.mock("@/ai/entitlement", () => ({ requireAiAccess: mocks.requireAiAccess }));
vi.mock("@/ai/resolve-config", () => ({
  resolveAiConfig: vi.fn().mockResolvedValue({
    provider: "OPENROUTER",
    model: "test/model",
    apiKey: "key",
  }),
}));
vi.mock("@/finance-engine/export", () => ({ exportTransactionsCsv: vi.fn() }));
vi.mock("./signals", () => ({ collectSnapshot: mocks.collectSnapshot }));
vi.mock("./analyst", () => ({ analyzeHeartbeat: mocks.analyzeHeartbeat }));
vi.mock("./dispatch", () => ({ dispatchHeartbeat: mocks.dispatchHeartbeat }));

import { tickHeartbeat } from "./scheduler";

/** 2026-08-04 07:30 Jakarta — lewat jam heartbeat, bukan Senin, bukan tanggal 1. */
const DUE_AT = new Date("2026-08-04T00:30:00Z");
const PERIOD = "daily:2026-08-04";

function analysisReady() {
  return {
    ok: true as const,
    analysis: {
      shouldSend: true,
      title: "Judul",
      body: "Isi",
      severity: "info" as const,
      actions: [],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findManySettings.mockResolvedValue([
    { userId: "u1", timezone: "Asia/Jakarta", heartbeatHour: 7 },
  ]);
  mocks.claimDeleteMany.mockResolvedValue({ count: 0 });
  mocks.claimCreate.mockResolvedValue({ id: "run1" });
  mocks.claimUpdate.mockResolvedValue({});
  mocks.claimUpdateMany.mockResolvedValue({ count: 1 });
  mocks.claimFindUnique.mockResolvedValue(null);
  mocks.requireAiAccess.mockResolvedValue({});
  mocks.collectSnapshot.mockResolvedValue({ cadence: "daily" });
  mocks.analyzeHeartbeat.mockResolvedValue(analysisReady());
  mocks.dispatchHeartbeat.mockResolvedValue({
    saved: true,
    telegram: 1,
    push: 0,
    document: false,
  });
});

describe("tickHeartbeat", () => {
  // Inti bug-nya: dulu penjaga duplikat membaca baris AiInsight, yang hanya
  // lahir kalau siklusnya sukses. Setiap skip tidak meninggalkan jejak, jadi
  // tick berikutnya 60 detik kemudian mengerjakan ulang user yang sama —
  // selamanya.
  it("menandai periode meski hasilnya skip, supaya tidak diulang tiap menit", async () => {
    mocks.requireAiAccess.mockRejectedValue(new Error("Premium only"));

    await tickHeartbeat(DUE_AT);

    expect(mocks.claimUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run1" },
        data: expect.objectContaining({ status: "SKIPPED", reason: "not-premium" }),
      }),
    );
  });

  // collectSnapshot menembakkan delapan query paralel. Akun FREE ditolak setiap
  // kali, jadi menjalankannya lebih dulu adalah beban database murni tanpa hasil.
  it("menolak akun FREE sebelum mengumpulkan sinyal", async () => {
    mocks.requireAiAccess.mockRejectedValue(new Error("Premium only"));

    await tickHeartbeat(DUE_AT);

    expect(mocks.collectSnapshot).not.toHaveBeenCalled();
    expect(mocks.analyzeHeartbeat).not.toHaveBeenCalled();
  });

  it("tidak mengerjakan periode yang sudah diklaim proses lain", async () => {
    mocks.claimCreate.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    mocks.claimFindUnique.mockResolvedValue({
      id: "run1",
      status: "RUNNING",
      reason: null,
      attempts: 1,
      finishedAt: null,
    });

    const ran = await tickHeartbeat(DUE_AT);

    expect(ran).toBe(0);
    expect(mocks.collectSnapshot).not.toHaveBeenCalled();
    expect(mocks.claimUpdate).not.toHaveBeenCalled();
  });

  it("tidak mengulang periode yang sudah benar-benar terkirim", async () => {
    mocks.claimCreate.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    mocks.claimFindUnique.mockResolvedValue({
      id: "run1",
      status: "SENT",
      reason: null,
      attempts: 1,
      finishedAt: new Date("2026-08-04T00:00:00Z"),
    });

    await tickHeartbeat(DUE_AT);

    expect(mocks.collectSnapshot).not.toHaveBeenCalled();
  });

  // Inti bug kedua: klaim ditulis sebelum kerja dan unique index membuatnya
  // permanen, jadi satu gangguan penyedia di jam kirim menghanguskan seluruh
  // hari itu — memperbaiki API key satu jam kemudian tidak menghasilkan apa pun.
  it("mencoba ulang periode yang gagal karena penyedia, sesudah masa jeda", async () => {
    mocks.claimCreate.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    mocks.claimFindUnique.mockResolvedValue({
      id: "run1",
      status: "SKIPPED",
      reason: "all-models-failed",
      attempts: 1,
      finishedAt: new Date("2026-08-03T23:00:00Z"), // 1,5 jam sebelum DUE_AT
    });

    await tickHeartbeat(DUE_AT);

    expect(mocks.claimUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run1", status: "SKIPPED" },
        data: expect.objectContaining({ status: "RUNNING", attempts: { increment: 1 } }),
      }),
    );
    expect(mocks.collectSnapshot).toHaveBeenCalled();
  });

  it("menunggu masa jeda sebelum mencoba ulang", async () => {
    mocks.claimCreate.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    mocks.claimFindUnique.mockResolvedValue({
      id: "run1",
      status: "SKIPPED",
      reason: "all-models-failed",
      attempts: 1,
      finishedAt: new Date("2026-08-04T00:20:00Z"), // baru 10 menit lalu
    });

    await tickHeartbeat(DUE_AT);

    expect(mocks.claimUpdateMany).not.toHaveBeenCalled();
    expect(mocks.collectSnapshot).not.toHaveBeenCalled();
  });

  it("berhenti mencoba ulang sesudah batas percobaan", async () => {
    mocks.claimCreate.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    mocks.claimFindUnique.mockResolvedValue({
      id: "run1",
      status: "SKIPPED",
      reason: "all-models-failed",
      attempts: 5,
      finishedAt: new Date("2026-08-03T20:00:00Z"),
    });

    await tickHeartbeat(DUE_AT);

    expect(mocks.claimUpdateMany).not.toHaveBeenCalled();
    expect(mocks.collectSnapshot).not.toHaveBeenCalled();
  });

  // "Bukan Premium" adalah keputusan, bukan gangguan. Mengulangnya tiap 30 menit
  // sampai tengah malam hanya menambah baris log tanpa mengubah hasil.
  it("tidak mencoba ulang skip yang memang keputusan", async () => {
    mocks.claimCreate.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    mocks.claimFindUnique.mockResolvedValue({
      id: "run1",
      status: "SKIPPED",
      reason: "not-premium",
      attempts: 1,
      finishedAt: new Date("2026-08-03T20:00:00Z"),
    });

    await tickHeartbeat(DUE_AT);

    expect(mocks.claimUpdateMany).not.toHaveBeenCalled();
  });

  it("mengklaim periode sebelum bekerja, bukan sesudah", async () => {
    await tickHeartbeat(DUE_AT);

    expect(mocks.claimCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          periodKey: PERIOD,
          cadence: "daily",
          status: "RUNNING",
        }),
      }),
    );
  });

  it("mencatat SENT saat laporan benar-benar sampai ke kanal", async () => {
    await tickHeartbeat(DUE_AT);

    expect(mocks.claimUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SENT", reason: null }),
      }),
    );
  });

  // Analis memutuskan tidak ada yang layak mengganggu user vs. user belum punya
  // kanal sama sekali: dua sebab yang butuh tindakan berbeda dari admin.
  it("membedakan 'tidak layak dikirim' dari 'tidak ada kanal'", async () => {
    mocks.dispatchHeartbeat.mockResolvedValue({
      saved: true,
      telegram: 0,
      push: 0,
      document: false,
    });

    await tickHeartbeat(DUE_AT);

    expect(mocks.claimUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SAVED", reason: "no-channel" }),
      }),
    );
  });

  it("meneruskan alasan kegagalan analis apa adanya", async () => {
    mocks.analyzeHeartbeat.mockResolvedValue({ ok: false, reason: "no-api-key" });

    await tickHeartbeat(DUE_AT);

    expect(mocks.claimUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SKIPPED", reason: "no-api-key" }),
      }),
    );
  });

  it("menandai FAILED saat siklusnya melempar, bukan membiarkan klaim menggantung", async () => {
    mocks.collectSnapshot.mockRejectedValue(new Error("Neon unreachable"));

    await tickHeartbeat(DUE_AT);

    expect(mocks.claimUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED", reason: "Neon unreachable" }),
      }),
    );
  });

  it("melewati user yang belum sampai jam heartbeat-nya", async () => {
    mocks.findManySettings.mockResolvedValue([
      { userId: "u1", timezone: "Asia/Jakarta", heartbeatHour: 9 },
    ]);

    await tickHeartbeat(DUE_AT);

    expect(mocks.claimCreate).not.toHaveBeenCalled();
  });
});
