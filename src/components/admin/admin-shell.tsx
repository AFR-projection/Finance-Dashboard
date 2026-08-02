"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BrainCircuit,
  CreditCard,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  ServerCog,
  ShieldCheck,
  Tags,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  {
    group: "Operasi",
    items: [
      { href: "/", label: "Ringkasan", icon: LayoutDashboard },
      { href: "/users", label: "Pengguna", icon: Users },
      { href: "/usage", label: "Pemakaian", icon: Gauge },
      { href: "/payments", label: "Pembayaran", icon: CreditCard },
    ],
  },
  {
    group: "Platform",
    items: [
      { href: "/ai", label: "AI & Model", icon: BrainCircuit },
      { href: "/plans", label: "Paket & Harga", icon: Tags },
      { href: "/security", label: "Keamanan", icon: ShieldCheck },
      { href: "/system", label: "Sistem", icon: ServerCog },
    ],
  },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  // The panel is served from admin.<host> with a /admin prefix rewritten in, so
  // the browser path and the href space differ by that prefix.
  const current = pathname.replace(/^\/admin/, "") || "/";

  return (
    <nav aria-label="Navigasi admin" className="flex flex-col gap-6">
      {NAV.map((section) => (
        <div key={section.group}>
          <p className="px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-ink-muted/60">
            {section.group}
          </p>
          <ul className="mt-2 space-y-0.5">
            {section.items.map((item) => {
              const active = current === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-brand-glow/40",
                      active
                        ? "bg-ink-soft text-ink-foreground"
                        : "text-ink-muted hover:bg-ink-soft/60 hover:text-ink-foreground",
                    )}
                  >
                    {active && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-brand-glow"
                      />
                    )}
                    <item.icon
                      aria-hidden
                      className={cn("size-4 shrink-0", active && "text-brand-glow")}
                      strokeWidth={2}
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function ServerClock() {
  const [now, setNow] = useState<string | null>(null);

  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  // Rendered only after mount: a server-rendered clock would hydrate mismatched.
  return (
    <span className="tabular-money hidden text-xs text-ink-muted sm:inline">{now ?? "--:--:--"}</span>
  );
}

export function AdminShell({
  admin,
  children,
}: {
  admin: { name: string | null; username: string | null };
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // Navigating closes the drawer. Adjusted during render rather than in an
  // effect so the closed drawer and the new page paint in the same commit.
  const [renderedPath, setRenderedPath] = useState(pathname);
  if (renderedPath !== pathname) {
    setRenderedPath(pathname);
    setDrawerOpen(false);
  }

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const label = admin.username ? `@${admin.username}` : admin.name || "admin";

  return (
    <div className="mk-ink vault-noise relative min-h-svh">
      <div className="relative mx-auto flex w-full max-w-[100rem]">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-ink-border/70 px-4 py-5 lg:flex">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-xl px-2 py-1 outline-none focus-visible:ring-3 focus-visible:ring-brand-glow/40"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-ink-soft text-brand-glow">
              <ShieldCheck aria-hidden className="size-4.5" strokeWidth={2.2} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold tracking-[-0.02em] text-ink-foreground">
                Master Admin
              </span>
              <span className="block truncate text-[11px] text-ink-muted">Ledgerly Console</span>
            </span>
          </Link>

          <div className="mt-7 flex-1 overflow-y-auto">
            <NavLinks />
          </div>

          <div className="mt-4 rounded-2xl border border-ink-border/70 bg-ink-soft/40 p-3">
            <p className="truncate text-xs font-semibold text-ink-foreground">{label}</p>
            <p className="mt-0.5 text-[11px] text-ink-muted">Sesi berakhir otomatis 4 jam</p>
            <form action="/api/admin/logout" method="post" className="mt-2.5">
              <button
                type="submit"
                className="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-ink-border text-xs font-semibold text-ink-muted outline-none transition-colors hover:border-rose-400/30 hover:text-rose-300 focus-visible:ring-3 focus-visible:ring-brand-glow/40"
              >
                <LogOut aria-hidden className="size-3.5" strokeWidth={2.2} />
                Keluar
              </button>
            </form>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-ink-border/70 bg-ink/70 backdrop-blur-xl">
            <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Buka navigasi"
                className="grid size-10 cursor-pointer place-items-center rounded-xl border border-ink-border text-ink-muted outline-none transition-colors hover:text-ink-foreground focus-visible:ring-3 focus-visible:ring-brand-glow/40 lg:hidden"
              >
                <Menu aria-hidden className="size-4.5" strokeWidth={2.2} />
              </button>

              <span className="flex items-center gap-2 lg:hidden">
                <ShieldCheck aria-hidden className="size-4 text-brand-glow" strokeWidth={2.2} />
                <span className="text-sm font-bold text-ink-foreground">Master Admin</span>
              </span>

              <div className="ml-auto flex items-center gap-3">
                <ServerClock />
                <span className="hidden items-center gap-2 rounded-full border border-ink-border bg-ink-soft/60 px-3 py-1.5 text-[11px] font-semibold text-ink-foreground sm:flex">
                  <Activity aria-hidden className="size-3.5 text-brand-glow" strokeWidth={2.4} />
                  {label}
                </span>
              </div>
            </div>
          </header>

          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
        </div>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Tutup navigasi"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 cursor-pointer bg-black/60 backdrop-blur-sm"
          />
          <div className="mk-ink absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-ink-border px-4 py-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-xl bg-ink-soft text-brand-glow">
                  <ShieldCheck aria-hidden className="size-4.5" strokeWidth={2.2} />
                </span>
                <span className="text-sm font-bold text-ink-foreground">Master Admin</span>
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Tutup navigasi"
                className="grid size-9 cursor-pointer place-items-center rounded-xl text-ink-muted outline-none transition-colors hover:text-ink-foreground focus-visible:ring-3 focus-visible:ring-brand-glow/40"
              >
                <X aria-hidden className="size-4.5" strokeWidth={2.2} />
              </button>
            </div>

            <div className="mt-7 flex-1 overflow-y-auto">
              <NavLinks onNavigate={() => setDrawerOpen(false)} />
            </div>

            <form action="/api/admin/logout" method="post" className="mt-4">
              <button
                type="submit"
                className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-ink-border text-sm font-semibold text-ink-muted outline-none transition-colors hover:border-rose-400/30 hover:text-rose-300 focus-visible:ring-3 focus-visible:ring-brand-glow/40"
              >
                <LogOut aria-hidden className="size-4" strokeWidth={2.2} />
                Keluar
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
