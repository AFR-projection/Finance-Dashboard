"use client";

import { useEffect } from "react";
import { animate, useMotionValue, useReducedMotion, useTransform, motion } from "framer-motion";

export function CountUp({
  value,
  format,
  className,
}: {
  value: number;
  format: (value: number) => string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(reduceMotion ? value : 0);
  // No rounding here: the formatter owns precision (IDR shows 0 decimals, USD 2).
  // Rounding first turned US$54.52 into US$55.00.
  const text = useTransform(motionValue, (latest) => format(latest));

  useEffect(() => {
    if (reduceMotion) {
      motionValue.set(value);
      return;
    }
    const controls = animate(motionValue, value, {
      duration: 1.1,
      ease: [0.22, 1, 0.36, 1],
    });
    return () => controls.stop();
  }, [value, reduceMotion, motionValue]);

  return <motion.span className={className}>{text}</motion.span>;
}
