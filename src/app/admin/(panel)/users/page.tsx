import { Search } from "lucide-react";
import { ManualActivateButton } from "@/components/admin/manual-activate-button";
import { UserStatusToggle } from "@/components/admin/user-status-toggle";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const admin = await getAdminSession();
  const term = q?.trim() ?? "";

  const users = await prisma.user.findMany({
    where: term
      ? {
          OR: [
            { username: { contains: term, mode: "insensitive" } },
            { name: { contains: term, mode: "insensitive" } },
            { telegramChatId: { contains: term } },
          ],
        }
      : undefined,
    select: {
      id: true,
      name: true,
      username: true,
      telegramChatId: true,
      role: true,
      status: true,
      createdAt: true,
      subscription: { select: { tier: true, currentPeriodEnd: true } },
      _count: { select: { transactions: true } },
    },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-[-0.03em] text-ink-foreground">Pengguna</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Menampilkan {users.length} akun terbaru{term ? ` untuk “${term}”` : ""}.
      </p>

      <form method="get" role="search" className="mt-6 flex gap-2">
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
            className="h-12 w-full rounded-2xl border border-ink-border bg-ink/60 pl-10 pr-4 text-sm text-ink-foreground outline-none placeholder:text-ink-muted focus-visible:ring-3 focus-visible:ring-brand-glow/40"
          />
        </div>
        <button
          type="submit"
          className="h-12 cursor-pointer rounded-2xl bg-white px-5 text-sm font-semibold text-ink outline-none transition-colors hover:bg-white/90 focus-visible:ring-3 focus-visible:ring-white/40"
        >
          Cari
        </button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-3xl border border-ink-border bg-ink-soft/50">
        <table className="w-full min-w-[44rem] text-sm">
          <caption className="sr-only">Daftar pengguna terdaftar</caption>
          <thead>
            <tr className="border-b border-ink-border text-left text-[11px] uppercase tracking-[0.14em] text-ink-muted">
              <th scope="col" className="px-5 py-3.5 font-bold">Akun</th>
              <th scope="col" className="px-5 py-3.5 font-bold">Telegram</th>
              <th scope="col" className="px-5 py-3.5 font-bold">Paket</th>
              <th scope="col" className="px-5 py-3.5 font-bold">Status</th>
              <th scope="col" className="px-5 py-3.5 text-right font-bold">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-ink-muted">
                  Tidak ada pengguna yang cocok.
                </td>
              </tr>
            )}
            {users.map((user) => (
              <tr key={user.id} className="border-b border-ink-border/60 last:border-0">
                <td className="px-5 py-4">
                  <p className="font-semibold text-ink-foreground">
                    {user.username ? `@${user.username}` : "(tanpa username)"}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {user.name || "—"} ·{" "}
                    {user.createdAt.toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </td>
                <td className="px-5 py-4 text-ink-muted">
                  {user.telegramChatId ? (
                    <span className="tabular-money text-xs">{user.telegramChatId}</span>
                  ) : (
                    <span className="text-xs">belum tertaut</span>
                  )}
                </td>
                <td className="tabular-money px-5 py-4 text-ink-muted">
                  {(() => {
                    const sub = user.subscription;
                    const active =
                      sub?.tier === "PREMIUM" && sub.currentPeriodEnd.getTime() > Date.now();
                    return active ? (
                      <span className="text-xs font-semibold text-brand-glow">
                        Premium
                        <span className="block font-normal text-ink-muted">
                          s/d{" "}
                          {sub!.currentPeriodEnd.toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "2-digit",
                          })}
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs">Gratis</span>
                    );
                  })()}
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      user.status === "SUSPENDED"
                        ? "bg-rose-500/15 text-rose-300"
                        : "bg-brand-glow/15 text-brand-glow"
                    }`}
                  >
                    {user.status === "SUSPENDED" ? "Ditangguhkan" : "Aktif"}
                    {user.role === "ADMIN" && " · admin"}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <ManualActivateButton userId={user.id} />
                    <UserStatusToggle
                      userId={user.id}
                      status={user.status}
                      disabled={user.role === "ADMIN" || user.id === admin?.userId}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
