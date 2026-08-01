import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const money = (value: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })
    .format(value);

export default async function AdminPaymentsPage() {
  const payments = await prisma.payment.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { username: true, name: true } } },
  });

  const paid = payments.filter((p) => p.status === "settlement" || p.status === "capture");
  const revenue = paid.reduce((total, p) => total + p.grossAmount, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-[-0.03em] text-ink-foreground">Pembayaran</h1>
      <p className="mt-2 text-sm text-ink-muted">
        {paid.length} pembayaran lunas · total {money(revenue)}. Aktivasi manual ada di halaman
        Pengguna.
      </p>

      <div className="mt-6 overflow-x-auto rounded-3xl border border-ink-border bg-ink-soft/50">
        <table className="w-full min-w-[40rem] text-sm">
          <caption className="sr-only">Riwayat pembayaran</caption>
          <thead>
            <tr className="border-b border-ink-border text-left text-[11px] uppercase tracking-[0.14em] text-ink-muted">
              <th scope="col" className="px-5 py-3.5 font-bold">Order</th>
              <th scope="col" className="px-5 py-3.5 font-bold">Pengguna</th>
              <th scope="col" className="px-5 py-3.5 font-bold">Jumlah</th>
              <th scope="col" className="px-5 py-3.5 font-bold">Status</th>
              <th scope="col" className="px-5 py-3.5 font-bold">Tanggal</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-ink-muted">
                  Belum ada pembayaran.
                </td>
              </tr>
            )}
            {payments.map((payment) => {
              const isPaid = payment.status === "settlement" || payment.status === "capture";
              return (
                <tr key={payment.id} className="border-b border-ink-border/60 last:border-0">
                  <td className="px-5 py-3.5">
                    <span className="tabular-money text-xs text-ink-muted">{payment.orderId}</span>
                  </td>
                  <td className="px-5 py-3.5 text-ink-foreground">
                    {payment.user.username ? `@${payment.user.username}` : payment.user.name || "—"}
                  </td>
                  <td className="tabular-money px-5 py-3.5 text-ink-foreground">
                    {payment.grossAmount === 0 ? "manual" : money(payment.grossAmount)}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        isPaid ? "bg-brand-glow/15 text-brand-glow" : "bg-ink text-ink-muted"
                      }`}
                    >
                      {payment.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-ink-muted">
                    {payment.createdAt.toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
