import { describe, expect, it } from "vitest";
import {
  UNGROUNDED_FIGURE_TEXT,
  UNVERIFIED_WRITE_CLAIM_TEXT,
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
      enforceWriteClaim({ text: "Pengeluaran sudah tercatat ✅", hasVerifiedWrite: false }),
    ).toBe(UNVERIFIED_WRITE_CLAIM_TEXT);
  });

  it("keeps the reply when a verified write happened", () => {
    const text = "Pengeluaran sudah tercatat di BCA";
    expect(enforceWriteClaim({ text, hasVerifiedWrite: true })).toBe(text);
  });

  it("leaves replies that never claimed a write", () => {
    const text = "Pengeluaran terbesar Anda ada di kategori Makanan.";
    expect(enforceWriteClaim({ text, hasVerifiedWrite: false })).toBe(text);
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
