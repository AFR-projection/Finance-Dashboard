import { describe, expect, it } from "vitest";

describe("encryptSecret roundtrip", () => {
  it("encrypts and decrypts", async () => {
    process.env.ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const { encryptSecret, decryptSecret } = await import("../lib/crypto");
    const plain = "sk-test-key-1234567890";
    const enc = encryptSecret(plain);
    expect(enc).not.toContain(plain);
    expect(decryptSecret(enc)).toBe(plain);
  });
});
