"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * Rolls a KPI from its previous value to the next one.
 *
 * The pulse arrives as a discrete jump every few seconds; without the roll, a
 * changed figure is indistinguishable from a figure that was always there.
 */
export function CountUp({
  value,
  format = (n: number) => n.toLocaleString("id-ID"),
  durationMs = 600,
  className,
}: {
  value: number;
  format?: (value: number) => string;
  durationMs?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const from = useRef(value);
  const frame = useRef<number | undefined>(undefined);

  // Reduced motion collapses the duration instead of branching to a direct
  // setState: the first frame lands on the final value, so the number still
  // arrives through the same path and nothing is set synchronously in the effect.
  const duration = reduced ? 0 : durationMs;

  useEffect(() => {
    const origin = from.current;
    const delta = value - origin;
    if (delta === 0) return;

    const start = performance.now();

    const step = (now: number) => {
      const t = duration <= 0 ? 1 : Math.min(1, (now - start) / duration);
      // easeOutExpo: fast commit, gentle settle.
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setDisplay(Math.round(origin + delta * eased));
      if (t < 1) frame.current = requestAnimationFrame(step);
      else from.current = value;
    };

    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      from.current = value;
    };
  }, [value, duration]);

  return <span className={className}>{format(display)}</span>;
}
