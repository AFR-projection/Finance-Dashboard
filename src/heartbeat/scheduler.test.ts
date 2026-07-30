import { describe, expect, it } from "vitest";
import { dueCadence, isoWeekKey, localClock, periodKeyFor } from "./scheduler";

describe("heartbeat scheduling", () => {
  it("reads the hour in the user's own timezone, not UTC", () => {
    // 2026-07-31T00:30:00Z is 07:30 in Jakarta — a Jakarta user set to 07 is due
    // even though it is still the previous evening in New York.
    const at = new Date("2026-07-31T00:30:00Z");

    expect(localClock("Asia/Jakarta", at).hour).toBe(7);
    expect(localClock("America/New_York", at).hour).toBe(20);
  });

  it("rolls the local date forward for timezones ahead of UTC", () => {
    const at = new Date("2026-07-30T23:30:00Z");

    expect(localClock("Asia/Jakarta", at).isoDate).toBe("2026-07-31");
    expect(localClock("UTC", at).isoDate).toBe("2026-07-30");
  });

  it("fires only on the configured hour", () => {
    const clock = { hour: 7, isoDate: "2026-07-31", weekday: 5 };

    expect(dueCadence({ clock, heartbeatHour: 7 })).toBe("daily");
    expect(dueCadence({ clock, heartbeatHour: 8 })).toBeNull();
  });

  it("replaces Monday's daily brief with the weekly recap", () => {
    const monday = { hour: 7, isoDate: "2026-08-03", weekday: 1 };

    expect(dueCadence({ clock: monday, heartbeatHour: 7 })).toBe("weekly");
  });

  it("keeps daily and weekly period keys distinct so neither blocks the other", () => {
    expect(periodKeyFor("daily", "2026-08-03")).toBe("daily:2026-08-03");
    expect(periodKeyFor("weekly", "2026-08-03")).toBe("weekly:2026-W32");
  });

  it("numbers ISO weeks across a year boundary", () => {
    // 2027-01-01 is a Friday, which ISO 8601 places in the last week of 2026.
    expect(isoWeekKey("2027-01-01")).toBe("2026-W53");
    expect(isoWeekKey("2026-07-31")).toBe("2026-W31");
  });
});
