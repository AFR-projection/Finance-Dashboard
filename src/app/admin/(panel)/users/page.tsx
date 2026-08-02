import { Search } from "lucide-react";
import Link from "next/link";
import { ManualActivateButton } from "@/components/admin/manual-activate-button";
import { UserStatusToggle } from "@/components/admin/user-status-toggle";
import {
  EmptyRow,
  InkTable,
  MiniBar,
  PageHeader,
  Panel,
  Td,
  Th,
  Tone,
  Tr,
  compactNumber,
  inkButtonGhost,
  inkInput,
  relativeTime,
} from "@/components/admin/ui";
import { currentPeriodKey } from "@/ai/usage";
import { getAdminSession } from "@/lib/admin-session";
import { getAppConfigRaw } from "@/lib/app-config";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

type Filters = { q?: string; status?: string; plan?: string; page?: string };

function buildWhere(term: string, status?: string, plan?: string): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};

  if (term) {
    where.OR = [
      { username: { contains: term, mode: "insensitive" } },
      { name: { contains: term, mode: "insensitive" } },
      { telegramChatId: { contains: term } },
    ];
  }
  if (status === "active" || status === "suspended") {
    where.status = status === "active" ? "ACTIVE" : "SUSPENDED";
  }
  // Premium is a live window, not a flag — an expired row is a free account.
  if (plan === "premium") {
    where.subscription = { is: { tier: "PREMIUM", currentPeriodEnd: { gt: new Date() } } };
  } else if (plan === "free") {
    where.OR = [
      ...(where.OR ?? []),
      { subscription: { is: null } },
      { subscription: { is: { currentPeriodEnd: { lte: new Date() } } } },
    ];
  }

  return where;
}

function queryString(base: Filters, overrides: Partial<Filters>) {
  const params = new URLSearchParams();
  const merged = { ...base, ...overrides };
  for (const [key, value] of Object.entries(merged)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  const filters = await searchParams;
  const nowMs = new Date().getTime();
  const term = filters.q?.trim() ?? "";
  const page = Math.max(1, Number(filters.page ?? "1") || 1);
  const where = buildWhere(term, filters.status, filters.plan);

  const [admin, cfg, total, users] = await Promise.all([
    getAdminSession(),
    getAppConfigRaw(),
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        username: true,
        telegramChatId: true,
        role: true,
        status: true,
        createdAt: true,
        tokenQuotaOverride: true,
        subscription: { select: { tier: true, currentPeriodEnd: true } },
        _count: { select: { transactions: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  // One grouped query instead of a per-row lookup: the table is paginated, but
  // N+1 against Neon would still cost 25 network round-trips.
  const usage = await prisma.aiUsageMonthly.groupBy({
    by: ["userId"],
    where: { periodKey: currentPeriodKey(), source: "CHAT", userId: { in: users.map((u) => u.id) } },
    _sum: { tokens: true },
  });
  const usageByUser = new Map(usage.map((row) => [row.userId, row._sum.tokens ?? 0]));

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeFilters: Filters = { q: term || undefined, status: filters.status, plan: filters.plan };

  const chips = [
    { key: "status", value: undefined, label: "Semua" },
    { key: "status", value: "active", label: "Aktif" },
    { key: "status", value: "suspended", label: "Ditangguhkan" },
    { key: "plan", value: "premium", label: "Premium" },
    { key: "plan", value: "free", label: "Gratis" },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Manajemen akun"
        title="Pengguna"
        description={`${total.toLocaleString("id-ID")} akun cocok dengan filter saat ini.`}
      />

      <Panel>
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-border/70 p-4">
          <form method="get" role="search" className="flex min-w-64 flex-1 gap-2">
            {filters.status && <input type="hidden" name="status" value={filters.status} />}
            {filters.plan && <input type="hidden" name="plan" value={filters.plan} />}
            <div className="relative flex-1">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
                strokeWidth={2}
              />
              <input
                type="search"
                name="q"
                defaultValue={term}
                placeholder="Cari username, nama, atau chat id"
                aria-label="Cari pengguna"
                className={`${inkInput} pl-10`}
              />
            </div>
            <button
              type="submit"
              className="h-11 cursor-pointer rounded-xl bg-white px-4 text-sm font-semibold text-ink outline-none transition-colors hover:bg-white/90 focus-visible:ring-3 focus-visible:ring-white/40"
            >
              Cari
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => {
              const active =
                chip.value === undefined
                  ? !filters.status && !filters.plan
                  : filters[chip.key] === chip.value;
              const href = queryString(
                { q: term || undefined },
                chip.value === undefined
                  ? {}
                  : { [chip.key]: chip.value, page: undefined },
              );
              return (
                <Link
                  key={`${chip.key}-${chip.label}`}
                  href={href || "?"}
                  className={`inline-flex h-9 items-center rounded-xl border px-3 text-xs font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-brand-glow/40 ${
                    active
                      ? "border-brand-glow/40 bg-brand-glow/10 text-brand-glow"
                      : "border-ink-border text-ink-muted hover:text-ink-foreground"
                  }`}
                >
                  {chip.label}
                </Link>
              );
            })}
          </div>
        </div>

        <InkTable
          caption="Daftar pengguna terdaftar"
          minWidth="58rem"
          head={
            <>
              <Th>Akun</Th>
              <Th>Telegram</Th>
              <Th>Paket</Th>
              <Th>Kuota chat bulan ini</Th>
              <Th>Status</Th>
              <Th className="text-right">Aksi</Th>
            </>
          }
        >
          {users.length === 0 && (
            <EmptyRow colSpan={6}>Tidak ada pengguna yang cocok dengan filter ini.</EmptyRow>
          )}
          {users.map((user) => {
            const sub = user.subscription;
            const premium = sub?.tier === "PREMIUM" && sub.currentPeriodEnd.getTime() > nowMs;
            const quota =
              user.tokenQuotaOverride ??
              (premium ? cfg.premiumTokenQuota : cfg.freeTokenQuota);
            const used = usageByUser.get(user.id) ?? 0;
            const pct = quota > 0 ? Math.round((used / quota) * 100) : 0;
            const initials = (user.username || user.name || "?").slice(0, 2).toUpperCase();

            return (
              <Tr key={user.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink text-[11px] font-bold text-brand-glow">
                      {initials}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-foreground">
                        {user.username ? `@${user.username}` : "(tanpa username)"}
                      </p>
                      <p className="truncate text-xs text-ink-muted">
                        {user.name || "—"} · bergabung {relativeTime(user.createdAt)}
                      </p>
                    </div>
                  </div>
                </Td>
                <Td className="text-ink-muted">
                  {user.telegramChatId ? (
                    <span className="tabular-money text-xs">{user.telegramChatId}</span>
                  ) : (
                    <span className="text-xs opacity-70">belum tertaut</span>
                  )}
                </Td>
                <Td>
                  {premium ? (
                    <div>
                      <Tone tone="positive">Premium</Tone>
                      <p className="tabular-money mt-1 text-[11px] text-ink-muted">
                        s/d{" "}
                        {sub!.currentPeriodEnd.toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "2-digit",
                        })}
                      </p>
                    </div>
                  ) : (
                    <Tone>Gratis</Tone>
                  )}
                </Td>
                <Td>
                  <div className="w-36">
                    <div className="tabular-money flex items-baseline justify-between text-[11px]">
                      <span className="font-semibold text-ink-foreground">
                        {compactNumber(used)}
                      </span>
                      <span className="text-ink-muted">
                        {quota > 0 ? `${pct}%` : "tanpa batas"}
                      </span>
                    </div>
                    <MiniBar
                      className="mt-1.5"
                      value={used}
                      max={quota}
                      tone={pct >= 90 ? "danger" : pct >= 70 ? "warning" : "positive"}
                    />
                    <p className="mt-1 text-[11px] text-ink-muted">
                      {user._count.transactions.toLocaleString("id-ID")} transaksi
                    </p>
                  </div>
                </Td>
                <Td>
                  <Tone tone={user.status === "SUSPENDED" ? "danger" : "positive"}>
                    {user.status === "SUSPENDED" ? "Ditangguhkan" : "Aktif"}
                    {user.role === "ADMIN" && " · admin"}
                  </Tone>
                </Td>
                <Td>
                  <div className="flex items-center justify-end gap-2">
                    <ManualActivateButton userId={user.id} days={cfg.premiumDurationDays} />
                    <UserStatusToggle
                      userId={user.id}
                      status={user.status}
                      disabled={user.role === "ADMIN" || user.id === admin?.userId}
                    />
                  </div>
                </Td>
              </Tr>
            );
          })}
        </InkTable>

        {pages > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-ink-border/70 px-5 py-3.5">
            <p className="text-xs text-ink-muted">
              Halaman {page} dari {pages}
            </p>
            <div className="flex gap-2">
              <Link
                href={queryString(activeFilters, { page: String(page - 1) })}
                aria-disabled={page <= 1}
                className={`${inkButtonGhost} h-9 px-3 text-xs ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
              >
                Sebelumnya
              </Link>
              <Link
                href={queryString(activeFilters, { page: String(page + 1) })}
                aria-disabled={page >= pages}
                className={`${inkButtonGhost} h-9 px-3 text-xs ${page >= pages ? "pointer-events-none opacity-40" : ""}`}
              >
                Berikutnya
              </Link>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
