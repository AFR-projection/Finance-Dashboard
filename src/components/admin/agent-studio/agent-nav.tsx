"use client";

/**
 * Sub-navigasi Agent Studio.
 *
 * Sebelumnya seluruh seksi ini satu halaman: topbar, rail metrik, palette,
 * kanvas, inspector, dan dok tiga tab berebut satu tinggi viewport. Tidak ada
 * satu pun yang cukup lapang, dan yang paling sering dipakai — kanvas — justru
 * paling banyak kehilangan ruang.
 *
 * Enam halaman ini dipisah menurut pertanyaan yang sedang dipegang admin, bukan
 * menurut jenis komponennya: bagaimana keadaannya (Ringkasan), bagaimana ia
 * dirangkai (Kanvas), apa yang benar-benar berjalan (Eksekusi), apakah yang
 * proaktif hidup (Siklus proaktif), apakah draft ini aman (Uji coba), dan apa
 * yang berubah sejak kemarin (Versi). Satu halaman menjawab satu pertanyaan.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gauge, History, ListTree, Timer, Wand2, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS: Array<{ href: string; label: string; short: string; icon: LucideIcon }> = [
  { href: "/agent", label: "Ringkasan", short: "Ringkasan", icon: Gauge },
  { href: "/agent/kanvas", label: "Kanvas", short: "Kanvas", icon: Workflow },
  { href: "/agent/eksekusi", label: "Eksekusi", short: "Eksekusi", icon: ListTree },
  { href: "/agent/proaktif", label: "Siklus proaktif", short: "Proaktif", icon: Timer },
  { href: "/agent/uji-coba", label: "Uji coba", short: "Uji", icon: Wand2 },
  { href: "/agent/versi", label: "Versi", short: "Versi", icon: History },
];

export function AgentNav() {
  const pathname = usePathname();
  // Panel disajikan dari admin.<host> dengan prefix /admin yang di-rewrite masuk,
  // jadi path browser dan ruang href berbeda sebesar prefix itu — sama seperti
  // yang dilakukan navigasi utama di `admin-shell`.
  const current = pathname.replace(/^\/admin/, "") || "/";

  return (
    <nav aria-label="Bagian Agent Studio" className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max items-center gap-1 px-1">
        {TABS.map((tab) => {
          // Pencocokan persis, bukan awalan: `/agent` adalah awalan dari semua
          // yang lain, jadi awalan akan menyalakan tab Ringkasan di setiap halaman.
          const active = current === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold outline-none transition-colors",
                  "focus-visible:ring-3 focus-visible:ring-brand-glow/40",
                  active
                    ? "bg-ink-soft text-ink-foreground"
                    : "text-ink-muted hover:bg-ink-soft/50 hover:text-ink-foreground",
                )}
              >
                <tab.icon
                  aria-hidden
                  className={cn("size-3.5 shrink-0", active && "text-brand-glow")}
                  strokeWidth={2.2}
                />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.short}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
