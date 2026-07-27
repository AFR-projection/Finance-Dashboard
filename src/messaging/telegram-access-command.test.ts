import { describe, expect, it } from "vitest";
import { parseTelegramAccessConfirmation } from "./telegram-access-command";

describe("parseTelegramAccessConfirmation", () => {
  it("treats a six-character hex code as approval", () => {
    expect(parseTelegramAccessConfirmation("153887")).toEqual({
      action: "approve",
      code: "153887",
    });
    expect(parseTelegramAccessConfirmation(" a1B2c3 ")).toEqual({
      action: "approve",
      code: "a1B2c3",
    });
  });

  it("parses approve and reject text forms", () => {
    expect(parseTelegramAccessConfirmation("approve ABC123")).toEqual({
      action: "approve",
      code: "ABC123",
    });
    expect(parseTelegramAccessConfirmation("REJECT 153887")).toEqual({
      action: "reject",
      code: "153887",
    });
  });

  it("does not mistake ordinary messages for access confirmations", () => {
    expect(parseTelegramAccessConfirmation("beli makan 35 ribu")).toBeNull();
    expect(parseTelegramAccessConfirmation("12345")).toBeNull();
  });
});
