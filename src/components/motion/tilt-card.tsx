"use client";

import { useRef } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  type HTMLMotionProps,
} from "framer-motion";
import { cn } from "@/lib/utils";

type TiltCardProps = Omit<HTMLMotionProps<"div">, "children"> & {
  children?: React.ReactNode;
  /** Max rotation in degrees on each axis. */
  intensity?: number;
  /** Renders a light glare that follows the pointer. */
  glare?: boolean;
};

const spring = { stiffness: 220, damping: 22, mass: 0.6 };

export function TiltCard({
  intensity = 9,
  glare = true,
  className,
  children,
  style,
  ...props
}: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const rotateX = useSpring(useMotionValue(0), spring);
  const rotateY = useSpring(useMotionValue(0), spring);
  const glareX = useSpring(useMotionValue(50), spring);
  const glareY = useSpring(useMotionValue(50), spring);
  const glareOpacity = useSpring(useMotionValue(0), spring);

  const glareBackground = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgb(255 255 255 / 0.3), transparent 55%)`;

  function handleMove(event: React.PointerEvent<HTMLDivElement>) {
    if (reduceMotion || event.pointerType === "touch") return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    rotateY.set((px - 0.5) * intensity * 2);
    rotateX.set((0.5 - py) * intensity * 2);
    glareX.set(px * 100);
    glareY.set(py * 100);
    glareOpacity.set(1);
  }

  function reset() {
    rotateX.set(0);
    rotateY.set(0);
    glareX.set(50);
    glareY.set(50);
    glareOpacity.set(0);
  }

  return (
    <motion.div
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={reset}
      style={{ rotateX, rotateY, transformPerspective: 1100, ...style }}
      className={cn("preserve-3d relative will-change-transform", className)}
      {...props}
    >
      {children}
      {glare && !reduceMotion && (
        <motion.span
          aria-hidden
          style={{ background: glareBackground, opacity: glareOpacity }}
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
        />
      )}
    </motion.div>
  );
}
