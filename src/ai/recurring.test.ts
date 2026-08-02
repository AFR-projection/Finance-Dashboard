import { describe, expect, it } from "vitest";
import { detectRecurringCharges, resolveExportRange } from "./recurring";

function charge(description: string, amount: number, isoDate: string) {
  return {
    description,
    amount,
    transactionDate: isoDate,
    category: { name: "Hiburan" },
    wallet: { name: "BCA", currency: "IDR" },
  };
}

describe("detectRecurringCharges", () => {
  it("flags a charge that repeats across three months at a stable amount", () => {
    const result = detectRecurringCharges(
      [
        charge("Spotify Premium", 54_990, "2026-05-03"),
        charge("Spotify Premium", 54_990, "2026-06-03"),
        charge("Spotify Premium", 54_990, "2026-07-03"),
      ],
      6,
    );

    expect(result.found).toBe(1);
    expect(result.charges[0].status).toBe("active");
    expect(result.charges[0].monthsSeen).toBe(3);
  });

  // Two occurrences is a coincidence; calling it a subscription trains the
  // user to ignore the list.
  it("ignores a charge seen in only two months", () => {
    const result = detectRecurringCharges(
      [charge("Netflix", 65_000, "2026-06-01"), charge("Netflix", 65_000, "2026-07-01")],
      6,
    );

    expect(result.found).toBe(0);
  });

  it("marks a subscription with no recent charge as possibly cancelled", () => {
    const old = ["2025-01-05", "2025-02-05", "2025-03-05"].map((d) =>
      charge("Gym Membership", 300_000, d),
    );

    const result = detectRecurringCharges(old, 12);

    expect(result.charges[0].status).toBe("possibly_cancelled");
    expect(result.charges[0].daysSinceLastSeen).toBeGreaterThan(45);
  });

  it("treats a widely varying amount as irregular, not a subscription", () => {
    const result = detectRecurringCharges(
      [
        charge("Belanja bulanan", 400_000, "2026-05-10"),
        charge("Belanja bulanan", 1_200_000, "2026-06-10"),
        charge("Belanja bulanan", 750_000, "2026-07-10"),
      ],
      6,
    );

    expect(result.charges[0].status).toBe("irregular");
  });

  it("groups descriptions that differ only by numbers or case", () => {
    const result = detectRecurringCharges(
      [
        charge("SPOTIFY 05/2026", 54_990, "2026-05-03"),
        charge("Spotify 06/2026", 54_990, "2026-06-03"),
        charge("spotify 07/2026", 54_990, "2026-07-03"),
      ],
      6,
    );

    expect(result.found).toBe(1);
    expect(result.charges[0].occurrences).toBe(3);
  });
});

describe("resolveExportRange", () => {
  it("uses the whole of last month, not a rolling 30 days", () => {
    const range = resolveExportRange("last_month");
    const from = range.from.toISOString().slice(0, 10);
    const to = range.to.toISOString().slice(0, 10);

    expect(from.endsWith("-01")).toBe(true);
    expect(range.to.getTime()).toBeGreaterThan(range.from.getTime());
    expect(range.label).toBe(from.slice(0, 7));
    expect(to.slice(0, 7)).toBe(from.slice(0, 7));
  });

  it("honours an explicit custom range", () => {
    const range = resolveExportRange("custom", "2026-03-01", "2026-03-15");

    expect(range.from.toISOString().slice(0, 10)).toBe("2026-03-01");
    expect(range.to.toISOString().slice(0, 10)).toBe("2026-03-15");
  });

  // A malformed date must not silently produce an empty or absurd window.
  it("falls back to this month when a custom range is unusable", () => {
    const range = resolveExportRange("custom", "bukan-tanggal", undefined);
    const now = new Date();

    expect(range.from.getUTCMonth()).toBe(now.getUTCMonth());
    expect(range.from.getUTCDate()).toBe(1);
  });
});
