import { currentPeriodKey } from "@/ai/usage";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminUsagePage() {
  const periodKey = currentPeriodKey();
  const rows = await prisma.aiUsageMonthly.findMany({
    where: { periodKey },
    orderBy: { tokens: "desc" },
    take: 100,
    include: { user: { select: { username: true, name: true } } },
  });

  const chat = rows.filter((r) => r.source === "CHAT");
  const heartbeat = rows.filter((r) => r.source === "HEARTBEAT");
  const sum = (list: typeof rows) => list.reduce((total, row) => total + row.tokens, 0);

  const totals = [
    { label: "Token chat", value: sum(chat) },
    { label: "Token heartbeat", value: sum(heartbeat) },
    { label: "Total token", value: sum(rows) },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-[-0.03em] text-ink-foreground">Pemakaian</h1>
      <p className="mt-2 text-sm text-ink-muted">Periode {periodKey} · 100 pemakai teratas.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {totals.map((total) => (
          <div key={total.label} className="rounded-3xl border border-ink-border bg-ink-soft/60 p-5">
            <p className="tabular-money text-2xl font-bold text-ink-foreground">
              {total.value.toLocaleString("id-ID")}
            </p>
            <p className="mt-1 text-sm text-ink-muted">{total.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto rounded-3xl border border-ink-border bg-ink-soft/50">
        <table className="w-full min-w-[36rem] text-sm">
          <caption className="sr-only">Pemakaian token per pengguna</caption>
          <thead>
            <tr className="border-b border-ink-border text-left text-[11px] uppercase tracking-[0.14em] text-ink-muted">
              <th scope="col" className="px-5 py-3.5 font-bold">Pengguna</th>
              <th scope="col" className="px-5 py-3.5 font-bold">Sumber</th>
              <th scope="col" className="px-5 py-3.5 font-bold">Token</th>
              <th scope="col" className="px-5 py-3.5 font-bold">Permintaan</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-ink-muted">
                  Belum ada pemakaian bulan ini.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={`${row.userId}-${row.source}`}
                className="border-b border-ink-border/60 last:border-0"
              >
                <td className="px-5 py-3.5 text-ink-foreground">
                  {row.user.username ? `@${row.user.username}` : row.user.name || "—"}
                </td>
                <td className="px-5 py-3.5 text-ink-muted">{row.source}</td>
                <td className="tabular-money px-5 py-3.5 text-ink-foreground">
                  {row.tokens.toLocaleString("id-ID")}
                </td>
                <td className="tabular-money px-5 py-3.5 text-ink-muted">{row.requests}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
