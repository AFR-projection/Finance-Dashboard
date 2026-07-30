"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, Sparkles } from "lucide-react";
import { NotificationBell } from "@/components/pwa/notification-bell";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  brandIcon as BrandIcon,
  intelligenceNav,
  mobilePrimaryNav,
  primaryNav,
  systemNav,
} from "./nav-items";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const active = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
  const moreItems = [...primaryNav.slice(2, 3), ...intelligenceNav.slice(1), ...systemNav];

  return (
    <>
      <header className="mobile-safe-top sticky top-0 z-30 -mx-4 mb-4 flex h-15 items-center justify-between border-b border-border/50 bg-background/85 px-4 backdrop-blur-xl lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground">
            <BrandIcon className="size-4" />
          </span>
          <span className="text-[15px] font-bold tracking-[-0.03em]">Ledgerly</span>
        </Link>
        <NotificationBell />
      </header>

      <nav className="mobile-safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-white/60 bg-background/90 px-2 pt-1.5 shadow-[0_-12px_40px_-24px_rgba(15,35,30,.35)] backdrop-blur-2xl lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {mobilePrimaryNav.map((item, index) => {
            const Icon = item.icon;
            const isAgent = index === 2;
            const isActive = active(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-semibold transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid place-items-center",
                    isAgent &&
                      "-mt-5 size-11 rounded-2xl bg-primary text-primary-foreground shadow-lg ring-4 ring-background",
                  )}
                >
                  <Icon
                    className={cn(isAgent ? "size-5" : "size-[19px]")}
                    strokeWidth={isActive ? 2.2 : 1.8}
                  />
                </span>
                <span>{isAgent ? "AI" : item.label}</span>
              </Link>
            );
          })}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-semibold text-muted-foreground">
              <MoreHorizontal className="size-[19px]" />
              <span>Lainnya</span>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="rounded-t-[2rem] border-border/60 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2"
            >
              <div className="mx-auto mt-1 h-1 w-10 rounded-full bg-border" />
              <SheetHeader className="px-1 pb-2 pt-4 text-left">
                <SheetTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="size-4 text-primary" /> Semua fitur
                </SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-3 gap-2 pb-2">
                {moreItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border border-border/60 bg-card px-2 text-center text-[11px] font-semibold",
                        active(item.href) && "border-primary/20 bg-primary/5 text-primary",
                      )}
                    >
                      <Icon className="size-5" strokeWidth={1.8} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </>
  );
}
