"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  PieChart,
  Sparkles,
  Wallet,
  Settings,
  Share2,
  MessageSquare,
  Bot,
  Target,
  LogOut,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/dashboard/analytics", label: "Analytics", icon: PieChart },
  { href: "/dashboard/insights", label: "AI Insights", icon: Sparkles },
  { href: "/dashboard/budgets", label: "Budgets", icon: Wallet },
  { href: "/dashboard/goals", label: "Goals", icon: Target },
  { href: "/dashboard/agent", label: "AI Agent", icon: Bot },
  { href: "/channels", label: "Channels", icon: MessageSquare },
  { href: "/dashboard/share", label: "Share", icon: Share2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border/60 bg-[oklch(0.985_0.01_165)] px-4 py-6">
      <Link href="/dashboard" className="mb-8 px-2">
        <div className="font-[family-name:var(--font-display)] text-2xl tracking-tight text-[oklch(0.28_0.06_165)]">
          Ledgerly
        </div>
        <p className="text-xs text-muted-foreground">AI Finance Agent</p>
      </Link>
      <nav className="flex flex-1 flex-col gap-1">
        {nav.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-[oklch(0.35_0.07_165)] text-white"
                  : "text-foreground/70 hover:bg-black/5 hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <Button
        variant="ghost"
        className="mt-4 justify-start gap-3 text-foreground/70"
        onClick={() => signOut({ callbackUrl: "/login" })}
      >
        <LogOut className="size-4" />
        Keluar
      </Button>
    </aside>
  );
}
