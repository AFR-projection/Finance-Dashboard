import { ConfigForm } from "@/components/admin/config-form";
import { getAppConfigRaw } from "@/lib/app-config";

export const dynamic = "force-dynamic";

export default async function AdminPlansPage() {
  const cfg = await getAppConfigRaw();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-[-0.03em] text-ink-foreground">Paket &amp; Harga</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Kuota dihitung per bulan kalender dan reset sendiri. Isi 0 untuk tanpa batas.
      </p>

      <div className="mt-8 grid max-w-4xl gap-5 lg:grid-cols-2">
        <ConfigForm
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
              label: "Harga Premium 30 hari (IDR)",
              type: "number",
              value: cfg.premiumPriceIdr,
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

        <ConfigForm
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
    </div>
  );
}
