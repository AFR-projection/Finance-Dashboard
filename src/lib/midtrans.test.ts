import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { verifySignature } from "@/lib/midtrans";

const serverKey = "SB-Mid-server-TESTKEY123";

function sign(orderId: string, statusCode: string, grossAmount: string) {
  return createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest("hex");
}

describe("verifySignature", () => {
  const base = { orderId: "ledgerly-abc123-1", statusCode: "200", grossAmount: "20000.00" };

  it("accepts a signature produced with the real server key", () => {
    expect(
      verifySignature({
        ...base,
        signatureKey: sign(base.orderId, base.statusCode, base.grossAmount),
        serverKey,
      }),
    ).toBe(true);
  });

  it("rejects a forged signature", () => {
    expect(
      verifySignature({ ...base, signatureKey: "a".repeat(128), serverKey }),
    ).toBe(false);
  });

  it("rejects a signature signed with a different server key", () => {
    const forged = createHash("sha512")
      .update(`${base.orderId}${base.statusCode}${base.grossAmount}attacker-key`)
      .digest("hex");
    expect(verifySignature({ ...base, signatureKey: forged, serverKey })).toBe(false);
  });

  it("rejects when the amount was tampered with", () => {
    // Attacker pays 1000 but claims the notification is for 20000.
    const signedForCheapAmount = sign(base.orderId, base.statusCode, "1000.00");
    expect(
      verifySignature({ ...base, signatureKey: signedForCheapAmount, serverKey }),
    ).toBe(false);
  });
});
