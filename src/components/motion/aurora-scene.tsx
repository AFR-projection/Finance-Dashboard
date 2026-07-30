"use client";

const blobs = [
  {
    className: "left-[-10%] top-[-15%] size-[46vmax]",
    background: "radial-gradient(circle, oklch(0.72 0.13 172 / 0.55), transparent 68%)",
    duration: "24s",
    delay: "0s",
  },
  {
    className: "right-[-14%] top-[6%] size-[38vmax]",
    background: "radial-gradient(circle, oklch(0.82 0.12 92 / 0.5), transparent 68%)",
    duration: "19s",
    delay: "-6s",
  },
  {
    className: "left-[22%] bottom-[-22%] size-[42vmax]",
    background: "radial-gradient(circle, oklch(0.66 0.14 245 / 0.42), transparent 70%)",
    duration: "28s",
    delay: "-12s",
  },
];

export function AuroraScene({ withGrid = true }: { withGrid?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="aurora-field">
        {blobs.map((blob) => (
          <div
            key={blob.className}
            className={`aurora-blob ${blob.className}`}
            style={
              {
                background: blob.background,
                "--blob-dur": blob.duration,
                "--blob-delay": blob.delay,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      {withGrid && (
        <div className="absolute inset-0 scene-3d">
          <div className="grid-floor" />
        </div>
      )}
    </div>
  );
}
