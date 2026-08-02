"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { inkButtonPrimary, inkInput } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

export type ConfigField =
  | { name: string; label: string; type: "text" | "number" | "secret"; value?: string | number; hint?: string; placeholder?: string }
  | { name: string; label: string; type: "toggle"; value: boolean; hint?: string };

/**
 * Membaca angka yang diketik dengan gaya Indonesia.
 *
 * Semua field angka di sini bilangan bulat (kuota, rupiah, jumlah hari), jadi
 * pemisah ribuan dibuang alih-alih dibaca sebagai desimal: "10.000" berarti
 * sepuluh ribu, bukan sepuluh. `Number()` mentah dulu membaca "12.500" sebagai
 * 12,5 lalu ditolak server karena bukan bilangan bulat.
 */
function parseInteger(raw: string) {
  const negative = raw.trimStart().startsWith("-");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  return negative ? -Number(digits) : Number(digits);
}

/** Generic save form for the admin config sections. */
export function ConfigForm({
  fields,
  title,
  bare = false,
}: {
  fields: ConfigField[];
  title: string;
  /** Set when the caller already supplies a Panel + PanelHeader around it. */
  bare?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("idle");
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {};

    for (const field of fields) {
      const raw = form.get(field.name);
      if (field.type === "toggle") {
        payload[field.name] = raw === "on";
        continue;
      }
      const value = String(raw ?? "").trim();
      // Blank secret means "leave the stored one alone".
      if (!value) continue;
      if (field.type === "number") {
        const parsed = parseInteger(value);
        if (parsed === null) continue;
        payload[field.name] = parsed;
        continue;
      }
      payload[field.name] = value;
    }

    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) {
        setStatus("error");
        setMessage(json.error || "Gagal menyimpan.");
        return;
      }
      setStatus("saved");
      setMessage(null);
      startTransition(() => router.refresh());
    } catch {
      setStatus("error");
      setMessage("Gagal terhubung ke server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className={cn(
        !bare && "rounded-3xl border border-ink-border bg-ink-soft/50 p-6 backdrop-blur-xl",
      )}
    >
      {!bare && (
        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-ink-muted">{title}</h2>
      )}

      <div className={cn("space-y-4", !bare && "mt-5")}>
        {fields.map((field) => (
          <div key={field.name}>
            {field.type === "toggle" ? (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-ink-border bg-ink/40 p-3.5 transition-colors hover:border-ink-muted/30">
                <input
                  type="checkbox"
                  name={field.name}
                  defaultChecked={field.value}
                  className="mt-0.5 size-4 cursor-pointer rounded border-ink-border bg-ink accent-brand-glow"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink-foreground">
                    {field.label}
                  </span>
                  {field.hint && (
                    <span className="mt-0.5 block text-xs text-ink-muted">{field.hint}</span>
                  )}
                </span>
              </label>
            ) : (
              <>
                <label
                  htmlFor={field.name}
                  className="block text-sm font-semibold text-ink-foreground"
                >
                  {field.label}
                </label>
                <input
                  id={field.name}
                  name={field.name}
                  // Field angka sengaja bertipe text: `type="number"` mengosongkan
                  // sendiri isian yang dianggapnya tidak valid, jadi "10,000"
                  // hilang diam-diam sebelum sempat dibaca. Parsing dikerjakan
                  // `parseInteger` supaya perilakunya sama di semua browser.
                  type={field.type === "secret" ? "password" : "text"}
                  inputMode={field.type === "number" ? "numeric" : undefined}
                  defaultValue={field.type === "secret" ? "" : (field.value ?? "")}
                  placeholder={field.placeholder}
                  autoComplete="off"
                  className={cn(inkInput, "mt-2")}
                />
                {field.hint && <p className="mt-1.5 text-xs text-ink-muted">{field.hint}</p>}
              </>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button type="submit" disabled={busy || pending} className={inkButtonPrimary}>
          {busy || pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Simpan
        </button>
        {status === "saved" && (
          <span className="flex items-center gap-1.5 text-sm text-brand-glow">
            <Check className="size-4" strokeWidth={2.4} /> Tersimpan
          </span>
        )}
        {status === "error" && (
          <span role="alert" className="text-sm text-rose-300">
            {message}
          </span>
        )}
      </div>
    </form>
  );
}
