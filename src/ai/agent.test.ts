import { describe, expect, it } from "vitest";
import { finalText } from "./agent";

const RECEIPT = "✅ Pengeluaran tercatat di BCA\nRp100.000 • Makanan\nayam geprek";

describe("finalText", () => {
  it("replaces prose that omits the account a transaction was written to", () => {
    const modelText = "✅ Pengeluaran tercatat\nRp100.000 • Makanan";

    expect(finalText(modelText, [{ walletName: "BCA", receipt: RECEIPT }])).toBe(RECEIPT);
  });

  it("keeps the reply when the model already named the account", () => {
    const modelText = "Pengeluaran Rp100.000 tercatat di BCA untuk ayam geprek.";

    expect(finalText(modelText, [{ walletName: "BCA", receipt: RECEIPT }])).toBe(modelText);
  });

  it("falls back to receipts when only some accounts were named", () => {
    const second = "✅ Pengeluaran tercatat di Mandiri\nRp50.000 • Transport\ngojek";
    const modelText = "Sudah tercatat di BCA dan satu lagi.";

    expect(
      finalText(modelText, [
        { walletName: "BCA", receipt: RECEIPT },
        { walletName: "Mandiri", receipt: second },
      ]),
    ).toBe(`${RECEIPT}\n\n${second}`);
  });

  it("leaves replies that involved no transaction write", () => {
    const modelText = "Pengeluaran terbesar Anda ada di kategori Makanan.";

    expect(finalText(modelText, [])).toBe(modelText);
  });
});
