import { CreditCard, Tags, TrendingUp } from "lucide-react";
import { ConfigForm } from "@/components/admin/config-form";
import {
  PageHeader,
  Panel,
  PanelHeader,
  Tone,
  compactNumber,
} from "@/components/admin/ui";
import { formatIdr } from "@/lib/admin-metrics";
import { getAppConfigRaw } from "@/lib/app-config";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminPlansPage() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [cfg, premiumCount, totalUsers, monthRevenue, expiringSoon] = await Promise.all([
    getAppConfigRaw(),
    prisma.subscription.count({ where: { tier: "PREMIUM", currentPeriodEnd: { gt: now } } }),
    prisma.user.count(),
    prisma.payment.aggregate({
      where: { status: { in: ["settlement", "capture"] }, createdAt: { gte: monthStart } },
      _sum: { grossAmount: true },
    }),
    prisma.subscription.count({
      where: {
        tier: "PREMIUM",
        currentPeriodEnd: { gt: now, lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const mrr = premiumCount * cfg.premiumPriceIdr;
  const conversion = totalUsers > 0 ? (premiumCount / totalUsers) * 100 : 0;
  const actualRevenue = monthRevenue._sum.grossAmount ?? 0;

  const projections = [
    { label: "Pendapatan berulang", value: formatIdr(mrr), hint: `${premiumCount} langganan aktif` },
    {
      label: "Terkumpul bulan ini",
      value: formatIdr(actualRevenue),
      hint: `${Math.round((actualRevenue / Math.max(1, mrr)) * 100)}% dari potensi`,
    },
    {
      label: "Konversi ke Premium",
      value: `${conversion.toFixed(1)}%`,
      hint: `${premiumCount} dari ${totalUsers.toLocaleString("id-ID")} akun`,
    },
    {
      label: "Berakhir dalam 7 hari",
      value: expiringSoon.toLocaleString("id-ID"),
      hint: expiringSoon > 0 ? "Kandidat perpanjangan" : "Tidak ada yang jatuh tempo",
    },
  ];

  const midtransReady = Boolean(cfg.midtransServerKey && cfg.midtransClientKey);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Monetisasi"
        title="Paket & Harga"
        description="Kuota dihitung per bulan kalender dan reset sendiri. Isi 0 untuk tanpa batas."
      />

      <Panel>
        <PanelHeader
          title="Dampak harga saat ini"
          hint={`Premium ${formatIdr(cfg.premiumPriceIdr)} per ${cfg.premiumDurationDays} hari`}
          icon={TrendingUp}
        />
        <div className="grid gap-px overflow-hidden bg-ink-border/50 sm:grid-cols-2 xl:grid-cols-4">
          {projections.map((item) => (
            <div key={item.label} className="bg-ink-soft/50 px-5 py-4">
              <p className="tabular-money text-xl font-bold tracking-[-0.02em] text-ink-foreground">
                {item.value}
              </p>
              <p className="mt-1 text-sm text-ink-muted">{item.label}</p>
              <p className="mt-0.5 text-[11px] text-ink-muted/70">{item.hint}</p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Kuota & harga"
            hint={`Gratis ${compactNumber(cfg.freeTokenQuota)} · Premium ${compactNumber(cfg.premiumTokenQuota)} token/bulan`}
            icon={Tags}
          />
          <div className="p-5">
            <ConfigForm
              bare
              title="Kuota & harga"
              fields={[
                {
                  name: "freeTokenQuota",
                  label: "Kuota token FREE / bulan",
                  type: "number",
                  value: cfg.freeTokenQuota,
                  hint: "0 = tanpa batas.",
                },
                {
                  name: "premiumTokenQuota",
                  label: "Kuota token PREMIUM / bulan",
                  type: "number",
                  value: cfg.premiumTokenQuota,
                },
                {
                  name: "premiumPriceIdr",
                  label: `Harga Premium ${cfg.premiumDurationDays} hari (IDR)`,
                  type: "number",
                  value: cfg.premiumPriceIdr,
                  hint: `Dengan ${premiumCount} langganan aktif, tiap Rp 1.000 kenaikan menambah ${formatIdr(premiumCount * 1000)} per siklus. Angka ini langsung tampil di landing page.`,
                },
                {
                  name: "premiumDurationDays",
                  label: "Masa aktif Premium (hari)",
                  type: "number",
                  value: cfg.premiumDurationDays,
                  hint: "Dipakai saat pembayaran lunas dan aktivasi manual. Langganan yang sudah berjalan tidak ikut berubah.",
                },
                {
                  name: "heartbeatForFree",
                  label: "Izinkan laporan otomatis untuk paket Gratis",
                  type: "toggle",
                  value: cfg.heartbeatForFree,
                  hint: "Token heartbeat tidak memotong kuota pengguna.",
                },
              ]}
            />
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Midtrans"
            icon={CreditCard}
            actions={
              <Tone tone={midtransReady ? "positive" : "warning"}>
                {midtransReady ? "Terkonfigurasi" : "Belum lengkap"}
              </Tone>
            }
          />
          <div className="p-5">
            <div className="mb-5 flex items-center gap-2 rounded-xl border border-ink-border bg-ink/40 px-3.5 py-3">
              <Tone tone={cfg.midtransIsProduction ? "danger" : "info"}>
                {cfg.midtransIsProduction ? "PRODUKSI" : "SANDBOX"}
              </Tone>
              <p className="text-xs text-ink-muted">
                {cfg.midtransIsProduction
                  ? "Transaksi memotong uang sungguhan."
                  : "Aman untuk pengujian — tidak ada uang berpindah."}
              </p>
            </div>

            <ConfigForm
              bare
              title="Midtrans"
              fields={[
                {
                  name: "midtransServerKey",
                  label: "Server Key",
                  type: "secret",
                  hint: cfg.midtransServerKey ? "Sudah tersimpan." : "Belum diisi.",
                },
                {
                  name: "midtransClientKey",
                  label: "Client Key",
                  type: "secret",
                  hint: cfg.midtransClientKey ? "Sudah tersimpan." : "Belum diisi.",
                },
                {
                  name: "midtransIsProduction",
                  label: "Mode produksi (matikan untuk sandbox)",
                  type: "toggle",
                  value: cfg.midtransIsProduction,
                },
              ]}
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}
