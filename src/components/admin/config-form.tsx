"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

export type ConfigField =
  | { name: string; label: string; type: "text" | "number" | "secret"; value?: string | number; hint?: string; placeholder?: string }
  | { name: string; label: string; type: "toggle"; value: boolean; hint?: string };

/** Generic save form for the admin config sections. */
export function ConfigForm({ fields, title }: { fields: ConfigField[]; title: string }) {
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
      payload[field.name] = field.type === "number" ? Number(value) : value;
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
    <form onSubmit={submit} className="rounded-3xl border border-ink-border bg-ink-soft/50 p-6">
      <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-ink-muted">{title}</h2>

      <div className="mt-5 space-y-4">
        {fields.map((field) => (
          <div key={field.name}>
            {field.type === "toggle" ? (
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  name={field.name}
                  defaultChecked={field.value}
                  className="size-4 rounded border-ink-border bg-ink accent-brand-glow"
                />
                <span className="text-sm text-ink-foreground">{field.label}</span>
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
                  type={field.type === "secret" ? "password" : field.type}
                  defaultValue={field.type === "secret" ? "" : (field.value ?? "")}
                  placeholder={field.placeholder}
                  autoComplete="off"
                  className="mt-2 h-11 w-full rounded-xl border border-ink-border bg-ink/60 px-3.5 text-sm text-ink-foreground outline-none placeholder:text-ink-muted focus-visible:ring-3 focus-visible:ring-brand-glow/40"
                />
              </>
            )}
            {field.hint && <p className="mt-1.5 text-xs text-ink-muted">{field.hint}</p>}
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || pending}
          className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-ink outline-none transition-colors hover:bg-white/90 focus-visible:ring-3 focus-visible:ring-white/40 disabled:opacity-60"
        >
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
