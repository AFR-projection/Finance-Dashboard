"use client";

/**
 * Ikon node, dipilih dari nama yang datang sebagai string dari katalog.
 *
 * Dibungkus jadi komponen sendiri karena mengangkat komponen dari sebuah peta ke
 * variabel lokal di tengah render adalah pola yang tidak bisa dibedakan linter
 * dari mendefinisikan komponen baru tiap render — dan yang kedua itu memang
 * bug. Di sini pemilihannya terjadi di satu tempat, dan sisanya cukup mengoper
 * nama.
 */

import { createElement } from "react";
import { iconFor } from "./shared";
import { cn } from "@/lib/utils";

export function NodeIcon({
  name,
  className,
  strokeWidth = 2.2,
}: {
  name: string;
  className?: string;
  strokeWidth?: number;
}) {
  // createElement, bukan <Icon />: mengangkat komponen ke variabel lokal lebih
  // dulu adalah pola yang memang sering jadi bug, dan aturan lint yang melarangnya
  // tidak punya cara membedakan kasus ini. Bentuk ini menyatakan maksudnya lugas.
  return createElement(iconFor(name), {
    "aria-hidden": true,
    className: cn("size-4", className),
    strokeWidth,
  });
}
