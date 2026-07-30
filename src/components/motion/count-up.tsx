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
  const text = useTransform(motionValue, (latest) => format(Math.round(latest)));

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
