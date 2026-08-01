import { redirect } from "next/navigation";
import Link from "next/link";
import {
  BrainCircuit,
  CreditCard,
  Gauge,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Tags,
  Users,
} from "lucide-react";
import { getAdminSession } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Panel Admin",
  robots: { index: false, follow: false },
};

const nav = [
  { href: "/", label: "Ringkasan", icon: LayoutDashboard },
  { href: "/users", label: "Pengguna", icon: Users },
  { href: "/ai", label: "AI", icon: BrainCircuit },
  { href: "/plans", label: "Paket", icon: Tags },
  { href: "/usage", label: "Pemakaian", icon: Gauge },
  { href: "/payments", label: "Bayar", icon: CreditCard },
];

/**
 * Guards everything in the (panel) group. /admin/login sits outside it on
 * purpose — a guarded login page would redirect to itself forever.
 */
export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts only verified the signature; revocation and role are enforced here.
  const session = await getAdminSession();
  if (!session) redirect("/login");

  return (
    <div className="mk-ink vault-noise flex min-h-svh flex-col">
      <header className="border-b border-ink-border bg-ink/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-5">
          <span className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-xl bg-ink-soft text-brand-glow">
              <ShieldCheck aria-hidden className="size-4" strokeWidth={2.2} />
            </span>
            <span className="hidden text-sm font-bold tracking-[-0.02em] text-ink-foreground sm:inline">
              Master Admin
            </span>
          </span>

          <nav aria-label="Navigasi admin" className="flex items-center gap-0.5 overflow-x-auto">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium text-ink-muted outline-none transition-colors hover:bg-ink-soft hover:text-ink-foreground focus-visible:ring-3 focus-visible:ring-brand-glow/40"
              >
                <item.icon aria-hidden className="size-4" strokeWidth={2} />
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            ))}
          </nav>

          <form action="/api/admin/logout" method="post" className="ml-auto">
            <button
              type="submit"
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-ink-border px-3 text-sm font-medium text-ink-muted outline-none transition-colors hover:text-ink-foreground focus-visible:ring-3 focus-visible:ring-brand-glow/40"
            >
              <LogOut aria-hidden className="size-4" strokeWidth={2} />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10">{children}</main>
    </div>
  );
}
