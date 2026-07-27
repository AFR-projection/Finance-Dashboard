import { describe, expect, it } from "vitest";
import makeWASocket, { DisconnectReason } from "@whiskeysockets/baileys";

describe("WhatsApp worker ESM runtime", () => {
  it("loads Baileys and its ESM-only Rust bridge", () => {
    expect(typeof makeWASocket).toBe("function");
    expect(DisconnectReason).toBeDefined();
  });
});
