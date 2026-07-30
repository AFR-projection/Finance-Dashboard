import { describe, expect, it } from "vitest";
import {
  UNGROUNDED_FIGURE_TEXT,
  UNVERIFIED_WRITE_CLAIM_TEXT,
  claimsTransactionWasSaved,
  classifyDeterministicIntent,
  enforceGroundedFigures,
  enforceWriteClaim,
  requiredToolForIntent,
} from "./intent-policy";

describe("classifyDeterministicIntent", () => {
  it("detects a completed transaction that must be recorded", () => {
    expect(classifyDeterministicIntent("tadi beli makan 100rb")).toBe("CREATE_TRANSACTION");
    expect(classifyDeterministicIntent("catat pengeluaran 25 ribu")).toBe("CREATE_TRANSACTION");
  });

  it("ignores hypothetical plans so no write is forced", () => {
    expect(classifyDeterministicIntent("kalau saya beli motor 20 juta gimana")).toBeNull();
  });

  it("detects balance and financial-scan questions", () => {
    expect(classifyDeterministicIntent("cek keuangan saya dong")).toBe("FINANCIAL_SNAPSHOT");
    expect(classifyDeterministicIntent("scan keuangan")).toBe("FINANCIAL_SNAPSHOT");
    expect(classifyDeterministicIntent("berapa saldo rekening saya")).toBe("FINANCIAL_SNAPSHOT");
  });

  it("maps an intent to the tool that must run", () => {
    expect(requiredToolForIntent("CREATE_TRANSACTION")).toBe("createTransaction");
    expect(requiredToolForIntent("FINANCIAL_SNAPSHOT")).toBe("getFinancialSnapshot");
    expect(requiredToolForIntent(null)).toBeUndefined();
  });
});

describe("enforceWriteClaim", () => {
  it("replaces a saved-claim that no tool receipt backs", () => {
    expect(
      enforceWriteClaim({
        text: "Pengeluaran sudah tercatat ✅",
        hasVerifiedWrite: false,
        writeIntended: true,
      }),
    ).toBe(UNVERIFIED_WRITE_CLAIM_TEXT);
  });

  it("keeps the reply when a verified write happened", () => {
    const text = "Pengeluaran sudah tercatat di BCA";
    expect(enforceWriteClaim({ text, hasVerifiedWrite: true, writeIntended: true })).toBe(text);
  });

  it("leaves replies that never claimed a write", () => {
    const text = "Pengeluaran terbesar Anda ada di kategori Makanan.";
    expect(enforceWriteClaim({ text, hasVerifiedWrite: false, writeIntended: true })).toBe(text);
  });

  it("leaves a balance answer that only describes existing records", () => {
    // The system prompt tells the model to write exactly this phrase, so the
    // write guard must not read it as a claim that something was just saved.
    const text = "Saldo Mandiri Rp2.500.000 berdasarkan data yang tercatat.";
    expect(enforceWriteClaim({ text, hasVerifiedWrite: false, writeIntended: false })).toBe(text);
  });

  it("does not treat descriptive or negated record wording as a save claim", () => {
    expect(claimsTransactionWasSaved("berdasarkan data yang tercatat")).toBe(false);
    expect(claimsTransactionWasSaved("Ada 12 transaksi yang tercatat bulan ini.")).toBe(false);
    expect(claimsTransactionWasSaved("Transaksi belum tercatat.")).toBe(false);
    expect(claimsTransactionWasSaved("Transaksi gagal disimpan.")).toBe(false);
  });

  it("still detects a real save claim", () => {
    expect(claimsTransactionWasSaved("Pengeluaran sudah tercatat")).toBe(true);
    expect(claimsTransactionWasSaved("Transaksi berhasil disimpan")).toBe(true);
    expect(claimsTransactionWasSaved("Data sudah tercatat di BCA")).toBe(true);
  });

  it("flags a save claim that follows a descriptive clause in the same reply", () => {
    // The first "tercatat" is descriptive; the second is a real claim and the
    // scan must not stop at the first excused match.
    expect(
      claimsTransactionWasSaved("Berdasarkan data yang tercatat, pengeluaran sudah tersimpan."),
    ).toBe(true);
  });
});

describe("enforceGroundedFigures", () => {
  it("blocks a balance figure invented without a read tool", () => {
    expect(
      enforceGroundedFigures({
        text: "Saldo rekening Anda Rp100.000",
        intent: "FINANCIAL_SNAPSHOT",
        ranRequiredRead: false,
      }),
    ).toBe(UNGROUNDED_FIGURE_TEXT);
  });

  it("allows figures once a read tool actually ran", () => {
    const text = "Saldo rekening Anda Rp50.000";
    expect(
      enforceGroundedFigures({ text, intent: "FINANCIAL_SNAPSHOT", ranRequiredRead: true }),
    ).toBe(text);
  });

  it("does not touch replies outside a balance question", () => {
    const text = "Rp25.000 itu wajar untuk makan siang.";
    expect(
      enforceGroundedFigures({ text, intent: null, ranRequiredRead: false }),
    ).toBe(text);
  });
});
