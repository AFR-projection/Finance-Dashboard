import { Activity, ShieldOff, UserCheck, Users } from "lucide-react";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [total, active, suspended, recent, liveSessions] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { status: "SUSPENDED" } }),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.accessSession.count({
      where: { scope: "USER", revokedAt: null, expiresAt: { gt: new Date() } },
    }),
  ]);

  const stats = [
    { label: "Total pengguna", value: total, icon: Users },
    { label: "Aktif", value: active, icon: UserCheck },
    { label: "Ditangguhkan", value: suspended, icon: ShieldOff },
    { label: "Sesi berjalan", value: liveSessions, icon: Activity },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-[-0.03em] text-ink-foreground">Ringkasan</h1>
      <p className="mt-2 text-sm text-ink-muted">
        {recent} pendaftar baru dalam 7 hari terakhir.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-3xl border border-ink-border bg-ink-soft/60 p-6 backdrop-blur-xl"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-ink text-brand-glow">
              <stat.icon aria-hidden className="size-5" strokeWidth={2} />
            </span>
            <p className="tabular-money mt-4 text-3xl font-bold text-ink-foreground">
              {stat.value}
            </p>
            <p className="mt-1 text-sm text-ink-muted">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-3xl border border-ink-border bg-ink-soft/40 p-6">
        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-ink-muted">
          Belum tersedia
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          Pengaturan API key AI, kuota token, harga paket, dan riwayat pembayaran menyusul di
          Fase 4 — semuanya butuh tabel langganan dan pemakaian token yang belum ada.
        </p>
      </div>
    </div>
  );
}
