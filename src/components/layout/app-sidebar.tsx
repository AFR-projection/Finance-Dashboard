"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, LogOut, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  brandIcon as BrandIcon,
  intelligenceNav,
  planningNav,
  primaryNav,
  systemNav,
  type NavItem,
} from "./nav-items";

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/access/logout", { method: "POST" });
    router.push("/masuk");
    router.refresh();
  }

  function navLink(item: NavItem) {
    const active =
      pathname === item.href ||
      (item.href !== "/dashboard" && pathname.startsWith(item.href));
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "group flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-medium transition-all",
          active
            ? "bg-primary text-primary-foreground shadow-[0_8px_24px_-12px_var(--primary)]"
            : "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground",
        )}
      >
        <span
          className={cn(
            "grid size-7 place-items-center rounded-lg transition-colors",
            active ? "bg-white/12" : "bg-foreground/[0.035] group-hover:bg-background",
          )}
        >
          <Icon className="size-4" strokeWidth={1.8} />
        </span>
        <span>{item.label}</span>
        {active && <span className="ml-auto size-1.5 rounded-full bg-emerald-300" />}
      </Link>
    );
  }

  return (
    <aside className="flex h-full w-[17.5rem] flex-col border-r border-sidebar-border/70 bg-sidebar/95 px-4 py-5 backdrop-blur-xl">
      <Link href="/dashboard" className="mb-6 flex items-center gap-3 px-2">
        <div className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_12px_30px_-14px_var(--primary)]">
          <BrandIcon className="size-5" strokeWidth={1.8} />
        </div>
        <div>
          <div className="text-[17px] font-bold tracking-[-0.03em] text-foreground">Ledgerly</div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Financial OS
          </p>
        </div>
      </Link>

      <nav className="hide-scrollbar flex flex-1 flex-col gap-5 overflow-y-auto pb-4">
        <div className="space-y-1">{primaryNav.map(navLink)}</div>
        <div>
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">
            Perencanaan
          </p>
          <div className="space-y-1">{planningNav.map(navLink)}</div>
        </div>
        <div>
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">
            Intelligence
          </p>
          <div className="space-y-1">{intelligenceNav.map(navLink)}</div>
        </div>
        <div>
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">
            Workspace
          </p>
          <div className="space-y-1">{systemNav.map(navLink)}</div>
        </div>
      </nav>

      <Link
        href="/dashboard/agent"
        className="group mb-3 overflow-hidden rounded-2xl bg-[linear-gradient(135deg,var(--primary),oklch(0.43_0.11_190))] p-3.5 text-primary-foreground shadow-[0_18px_35px_-24px_var(--primary)]"
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="grid size-7 place-items-center rounded-lg bg-white/12">
            <Sparkles className="size-3.5" />
          </span>
          <ArrowUpRight className="size-4 opacity-60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </div>
        <p className="text-xs font-semibold">Tanya AI Copilot</p>
        <p className="mt-0.5 text-[10px] leading-relaxed text-white/60">
          Analisis dan catat transaksi lebih cepat.
        </p>
      </Link>

      <Button
        variant="ghost"
        className="h-10 justify-start gap-3 rounded-xl px-3 text-xs text-foreground/55"
        onClick={() => void logout()}
      >
        <LogOut className="size-4" />
        Tutup sesi
      </Button>
    </aside>
  );
}
