import { ImageResponse } from "next/og";

export const alt = "Ledgerly — Catat keuangan cukup lewat chat Telegram";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * OG card drawn in code so it always matches the brand tokens. Approximate the
 * OKLCH palette with sRGB since Satori only takes rgb/hex.
 */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          backgroundColor: "#0e1d1e",
          backgroundImage:
            "radial-gradient(ellipse 90% 70% at 50% -20%, rgba(45,106,96,.55), transparent 60%)," +
            "radial-gradient(ellipse 70% 50% at 90% 110%, rgba(122,101,38,.35), transparent 62%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              backgroundColor: "#1f4d44",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              fontWeight: 800,
              color: "#eef7f2",
            }}
          >
            L
          </div>
          <span style={{ fontSize: 40, fontWeight: 700, color: "#f2f7f5", letterSpacing: -1 }}>
            Ledgerly
          </span>
        </div>

        {/* Headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <span
            style={{
              fontSize: 76,
              fontWeight: 800,
              color: "#f2f7f5",
              letterSpacing: -3,
              lineHeight: 1.05,
            }}
          >
            Ngobrol biasa,
          </span>
          <span
            style={{
              fontSize: 76,
              fontWeight: 800,
              color: "#8fd8c7",
              letterSpacing: -3,
              lineHeight: 1.05,
            }}
          >
            keuangan tercatat.
          </span>
          <span style={{ fontSize: 30, color: "#a8bcb8", marginTop: 8 }}>
            Catat pengeluaran lewat chat Telegram — AI yang merapikan sisanya.
          </span>
        </div>

        {/* Chat bubble strip */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              padding: "16px 28px",
              borderRadius: 26,
              backgroundColor: "#1f4d44",
              color: "#eef7f2",
              fontSize: 27,
            }}
          >
            kopi sama roti 32rb pake gopay
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "16px 28px",
              borderRadius: 26,
              backgroundColor: "rgba(255,255,255,0.09)",
              border: "1px solid rgba(255,255,255,0.14)",
              color: "#8fd8c7",
              fontSize: 27,
            }}
          >
            {/* Check mark drawn with borders — no glyph, no font fetch. */}
            <div
              style={{
                width: 18,
                height: 10,
                borderLeft: "4px solid #8fd8c7",
                borderBottom: "4px solid #8fd8c7",
                transform: "rotate(-45deg) translateY(-4px)",
              }}
            />
            Tercatat: Jajan · GoPay
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
