import { ConfigForm } from "@/components/admin/config-form";
import { getAppConfigRaw } from "@/lib/app-config";

export const dynamic = "force-dynamic";

export default async function AdminAiPage() {
  const cfg = await getAppConfigRaw();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-[-0.03em] text-ink-foreground">AI &amp; Model</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Key dan model berlaku untuk semua pengguna. Pengguna tidak bisa memilih modelnya sendiri.
      </p>

      <div className="mt-8 max-w-2xl space-y-5">
        <ConfigForm
          title="OpenRouter"
          fields={[
            {
              name: "openrouterApiKey",
              label: "API Key",
              type: "secret",
              hint: cfg.openrouterApiKey
                ? "Sudah tersimpan. Kosongkan untuk membiarkannya."
                : "Belum diisi — sementara memakai OPENROUTER_API_KEY dari .env.",
              placeholder: "sk-or-v1-…",
            },
            {
              name: "aiModel",
              label: "Model utama",
              type: "text",
              value: cfg.aiModel,
              placeholder: "openai/gpt-4o-mini",
            },
            {
              name: "aiFallbackModels",
              label: "Model cadangan",
              type: "text",
              value: cfg.aiFallbackModels ?? "",
              hint: "Pisahkan dengan koma. Dipakai kalau model utama gagal.",
            },
          ]}
        />
      </div>
    </div>
  );
}
