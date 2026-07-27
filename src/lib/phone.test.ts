import { describe, expect, it } from "vitest";
import { phoneMatchKey, phonesMatch, toPhoneDigits } from "./phone";

describe("toPhoneDigits", () => {
  it("keeps digits only", () => {
    expect(toPhoneDigits("+62 821-2587-6845")).toBe("6282125876845");
  });

  it("returns empty for nullish", () => {
    expect(toPhoneDigits(null)).toBe("");
    expect(toPhoneDigits(undefined)).toBe("");
  });
});

describe("phoneMatchKey", () => {
  it("strips the national trunk prefix", () => {
    expect(phoneMatchKey("082125876845")).toBe("82125876845");
  });

  it("strips the international access prefix", () => {
    expect(phoneMatchKey("006282125876845")).toBe("6282125876845");
  });
});

describe("phonesMatch", () => {
  it("matches a stored number that is missing its country code", () => {
    expect(phonesMatch("85568541476", "6285568541476")).toBe(true);
  });

  it("matches across formatting differences", () => {
    expect(phonesMatch("+62 821-2587-6845", "6282125876845")).toBe(true);
  });

  it("matches a nationally-formatted number against E.164", () => {
    expect(phonesMatch("082125876845", "6282125876845")).toBe(true);
  });

  it.each([
    ["US", "12125550142", "2125550142"],
    ["India", "919876543210", "9876543210"],
    ["UK", "447911123456", "7911123456"],
    ["Nigeria", "2348012345678", "8012345678"],
    ["Brazil", "5511987654321", "11987654321"],
  ])("matches %s numbers with and without the dial code", (_country, full, local) => {
    expect(phonesMatch(local, full)).toBe(true);
  });

  it("rejects different subscribers", () => {
    expect(phonesMatch("6285568541476", "6282125876845")).toBe(false);
  });

  it("rejects a suffix too short to identify a subscriber", () => {
    expect(phonesMatch("541476", "6285568541476")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(phonesMatch("", "6285568541476")).toBe(false);
    expect(phonesMatch(null, undefined)).toBe(false);
  });
});
