/**
 * One-shot PWA icon generator. Renders the Ledgerly mark with next/og (already
 * a Next dependency) so no image library is needed, then writes PNGs to
 * public/icons. Re-run only when the brand mark changes:
 *   npx tsx scripts/gen-icons.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

const OUT_DIR = path.join(process.cwd(), "public", "icons");

const TEAL_DEEP = "#0c2b2a";
const TEAL = "#14504b";
const TEAL_LIGHT = "#2f8f80";
const CREAM = "#f3f7f5";

/** The credit-card mark, drawn with boxes because Satori ignores SVG strokes. */
function Mark({ size, color }: { size: number; color: string }) {
  const width = size;
  const height = Math.round(size * 0.68);
  const stroke = Math.max(2, Math.round(size * 0.085));
  return (
    <div
      style={{
        display: "flex",
        width,
        height,
        borderRadius: Math.round(size * 0.14),
        border: `${stroke}px solid ${color}`,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: Math.round(height * 0.22),
          height: stroke,
          background: color,
        }}
      />
    </div>
  );
}

function Tile({ size, safeRatio }: { size: number; safeRatio: number }) {
  const inner = Math.round(size * safeRatio);
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(145deg, ${TEAL_LIGHT} 0%, ${TEAL} 45%, ${TEAL_DEEP} 100%)`,
      }}
    >
      <div
        style={{
          width: inner,
          height: inner,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Mark size={inner} color={CREAM} />
      </div>
    </div>
  );
}

async function render(name: string, size: number, safeRatio: number) {
  const response = new ImageResponse(<Tile size={size} safeRatio={safeRatio} />, {
    width: size,
    height: size,
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  const target = path.join(OUT_DIR, name);
  await writeFile(target, buffer);
  console.log(`wrote ${path.relative(process.cwd(), target)} (${buffer.length} bytes)`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  // Plain icons fill the tile; maskable icons keep the mark inside Android's
  // circular safe zone, which crops roughly 10% from every edge.
  await render("icon-192.png", 192, 0.62);
  await render("icon-512.png", 512, 0.62);
  await render("icon-192-maskable.png", 192, 0.46);
  await render("icon-512-maskable.png", 512, 0.46);
  await render("apple-touch-icon.png", 180, 0.62);
}

void main();
