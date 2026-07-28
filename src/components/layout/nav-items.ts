import {
  ArrowLeftRight,
  BarChart3,
  Bot,
  CreditCard,
  Goal,
  LayoutDashboard,
  Lightbulb,
  MessageCircleMore,
  PiggyBank,
  Settings,
  Share2,
  WalletCards,
} from "lucide-react";

export const primaryNav = [
  { href: "/dashboard", label: "Beranda", icon: LayoutDashboard },
  { href: "/dashboard/transactions", label: "Transaksi", icon: ArrowLeftRight },
  { href: "/dashboard/wallets", label: "Rekening", icon: WalletCards },
  { href: "/dashboard/analytics", label: "Analitik", icon: BarChart3 },
];

export const intelligenceNav = [
  { href: "/dashboard/agent", label: "AI Copilot", icon: Bot },
  { href: "/dashboard/insights", label: "AI Insights", icon: Lightbulb },
  { href: "/dashboard/budgets", label: "Budget", icon: PiggyBank },
  { href: "/dashboard/goals", label: "Goals", icon: Goal },
];

export const systemNav = [
  { href: "/channels", label: "Channels", icon: MessageCircleMore },
  { href: "/dashboard/share", label: "Share", icon: Share2 },
  { href: "/settings", label: "Pengaturan", icon: Settings },
];

export const mobilePrimaryNav = [primaryNav[0], primaryNav[1], intelligenceNav[0], primaryNav[3]];
export type NavItem = (typeof primaryNav)[number];
export const brandIcon = CreditCard;
