import { describe, expect, it } from "vitest";
import { parseAccessConfirmation } from "./access-command";

describe("parseAccessConfirmation", () => {
  it("treats a six-character hex code as approval", () => {
    expect(parseAccessConfirmation("153887")).toEqual({
      action: "approve",
      code: "153887",
    });
    expect(parseAccessConfirmation(" a1B2c3 ")).toEqual({
      action: "approve",
      code: "a1B2c3",
    });
  });

  it("parses approve and reject text forms", () => {
    expect(parseAccessConfirmation("approve ABC123")).toEqual({
      action: "approve",
      code: "ABC123",
    });
    expect(parseAccessConfirmation("REJECT 153887")).toEqual({
      action: "reject",
      code: "153887",
    });
  });

  it("does not mistake ordinary messages for access confirmations", () => {
    expect(parseAccessConfirmation("beli makan 35 ribu")).toBeNull();
    expect(parseAccessConfirmation("12345")).toBeNull();
  });
});
