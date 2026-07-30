import { describe, expect, it } from "vitest";
import { formatForChannel, splitForChannel } from "./chat-format";

describe("formatForChannel", () => {
  it("emits HTML tags", () => {
    expect(formatForChannel("**Ringkasan**")).toBe("<b>Ringkasan</b>");
  });

  it("escapes characters that would break HTML parsing", () => {
    expect(formatForChannel("untung > rugi & aman")).toBe("untung &gt; rugi &amp; aman");
  });

  it("escapes inside emphasis too", () => {
    expect(formatForChannel("**a > b**")).toBe("<b>a &gt; b</b>");
  });

  it("converts headings to bold lines", () => {
    expect(formatForChannel("### Analisis")).toBe("<b>Analisis</b>");
  });

  it("normalizes bullets", () => {
    expect(formatForChannel("- kopi 25 ribu\n- makan 35 ribu")).toBe(
      "• kopi 25 ribu\n• makan 35 ribu",
    );
  });

  it("keeps single-asterisk italic from turning into stray markers", () => {
    expect(formatForChannel("ini *penting* ya")).toBe("ini <i>penting</i> ya");
  });

  it("does not treat Rp amounts or mid-word underscores as emphasis", () => {
    expect(formatForChannel("Rp25.000 untuk net_cash hari ini")).toBe(
      "Rp25.000 untuk net_cash hari ini",
    );
  });

  it("flattens Markdown tables into readable lines", () => {
    const table = ["| Kategori | Total |", "| --- | --- |", "| Makanan | Rp500.000 |"].join("\n");
    expect(formatForChannel(table)).toBe("Kategori — Total\nMakanan — Rp500.000");
  });

  it("drops horizontal rules", () => {
    expect(formatForChannel("Ringkasan\n---\nAnalisis")).toBe("Ringkasan\nAnalisis");
  });

  it("collapses excessive blank lines", () => {
    expect(formatForChannel("a\n\n\n\nb")).toBe("a\n\nb");
  });

  it("leaves plain text untouched", () => {
    expect(formatForChannel("Pengeluaran tercatat Rp35.000")).toBe(
      "Pengeluaran tercatat Rp35.000",
    );
  });
});

describe("splitForChannel", () => {
  it("keeps short text as one chunk", () => {
    expect(splitForChannel("halo", 100)).toEqual(["halo"]);
  });

  it("splits on paragraph boundaries, not mid-word", () => {
    const chunks = splitForChannel(`${"a".repeat(60)}\n\n${"b".repeat(60)}`, 100);
    expect(chunks).toEqual(["a".repeat(60), "b".repeat(60)]);
  });

  it("never emits a chunk longer than the limit", () => {
    const chunks = splitForChannel("x".repeat(250), 100);
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
    expect(chunks.join("")).toBe("x".repeat(250));
  });

  it("does not split inside a Telegram tag", () => {
    const text = `${"a".repeat(80)}\n<b>Ringkasan penting</b>`;
    for (const chunk of splitForChannel(text, 100)) {
      expect((chunk.match(/<b>/g) ?? []).length).toBe((chunk.match(/<\/b>/g) ?? []).length);
    }
  });
});
