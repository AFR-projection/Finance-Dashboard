"use client";

/**
 * Form config node, digenerate dari katalog.
 *
 * Tidak ada satu pun field yang ditulis tangan di sini. Katalog adalah sumber
 * kebenaran yang sama yang dibaca engine, jadi knob yang muncul di form dijamin
 * knob yang benar-benar dibaca runtime — bukan dua daftar yang harus dijaga
 * tetap sinkron.
 */

import { useMemo, useState } from "react";
import { CheckSquare, Search, Square, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { inkInput } from "@/components/admin/ui";
import { NodeIcon } from "./node-icon";
import { ACCENTS, type AgentNodeKind, type ConfigFieldOf, type NodeDefinition } from "./shared";

export type InspectorNode = {
  id: string;
  kind: AgentNodeKind;
  label?: string;
  enabled: boolean;
  config: Record<string, unknown>;
};

export function NodeInspector({
  node,
  definition,
  issues,
  onChange,
  onToggleEnabled,
  onRename,
  onDelete,
}: {
  node: InspectorNode | null;
  definition: NodeDefinition | null;
  issues: string[];
  onChange: (key: string, value: unknown) => void;
  onToggleEnabled: (enabled: boolean) => void;
  onRename: (label: string) => void;
  onDelete: () => void;
}) {
  if (!node || !definition) {
    return (
      <div className="px-4 py-10 text-center text-xs text-ink-muted">
        Pilih satu node di kanvas untuk mengatur perilakunya.
      </div>
    );
  }

  const accent = ACCENTS[definition.accent];

  return (
    <div className="flex flex-col">
      <div className="flex items-start gap-2.5 border-b border-ink-border/70 px-4 py-3.5">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", accent.bg, accent.text)}>
          <NodeIcon name={definition.icon} className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink-foreground">{definition.label}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">{definition.description}</p>
        </div>
      </div>

      {issues.length > 0 && (
        <ul className="space-y-1 border-b border-ink-border/70 bg-rose-500/8 px-4 py-3">
          {issues.map((issue) => (
            <li key={issue} className="text-[11px] leading-snug text-rose-200">
              {issue}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-4 px-4 py-4">
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
            Nama di kanvas
          </span>
          <input
            type="text"
            value={node.label ?? ""}
            maxLength={80}
            placeholder={definition.label}
            onChange={(event) => onRename(event.target.value)}
            className={cn(inkInput, "mt-1.5 h-10")}
          />
        </label>

        <ToggleRow
          label="Node aktif"
          hint="Dimatikan = tetap tergambar, tapi dilewati saat eksekusi."
          checked={node.enabled}
          disabled={definition.required}
          disabledHint={definition.required ? "Node wajib — jalur ini tidak berarti tanpanya." : undefined}
          onChange={onToggleEnabled}
        />

        {definition.fields.length === 0 && (
          <p className="rounded-xl border border-ink-border/70 bg-ink/40 px-3 py-2.5 text-[11px] text-ink-muted">
            Node ini tidak punya pengaturan — keberadaannya di jalur yang menentukan.
          </p>
        )}

        {definition.fields.map((field) => (
          <Field
            key={field.key}
            field={field}
            value={node.config[field.key]}
            onChange={(value) => onChange(field.key, value)}
          />
        ))}
      </div>

      {!definition.required && (
        <div className="border-t border-ink-border/70 px-4 py-3">
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-rose-400/30 text-xs font-semibold text-rose-300 outline-none transition-colors hover:bg-rose-500/10 focus-visible:ring-3 focus-visible:ring-rose-400/40"
          >
            <Trash2 aria-hidden className="size-3.5" strokeWidth={2.2} />
            Hapus node ini
          </button>
        </div>
      )}
    </div>
  );
}

function Field({
  field,
  value,
  onChange,
}: {
  field: ConfigFieldOf;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.type === "toggle") {
    return (
      <ToggleRow
        label={field.label}
        hint={field.hint}
        checked={value === undefined ? field.default : Boolean(value)}
        onChange={onChange}
      />
    );
  }

  if (field.type === "number") {
    const current = typeof value === "number" ? value : field.default;
    return (
      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
          {field.label}
        </span>
        <input
          type="number"
          value={current}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          onChange={(event) => {
            const next = Number(event.target.value);
            // Nilai di luar rentang tidak diam-diam dijepit: yang dikirim adalah
            // apa yang diketik, dan validasi server yang memutuskan.
            onChange(Number.isFinite(next) ? next : field.default);
          }}
          className={cn(inkInput, "tabular-money mt-1.5 h-10")}
        />
        <span className="mt-1 block text-[10px] text-ink-muted">
          {field.hint ? `${field.hint} ` : ""}
          <span className="tabular-money">
            (rentang {field.min}–{field.max})
          </span>
        </span>
      </label>
    );
  }

  if (field.type === "text") {
    return (
      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
          {field.label}
        </span>
        <input
          type="text"
          value={typeof value === "string" ? value : field.default}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={cn(inkInput, "mt-1.5 h-10")}
        />
        {field.hint && <span className="mt-1 block text-[10px] text-ink-muted">{field.hint}</span>}
      </label>
    );
  }

  return <MultiSelect field={field} value={Array.isArray(value) ? (value as string[]) : field.default} onChange={onChange} />;
}

function MultiSelect({
  field,
  value,
  onChange,
}: {
  field: Extract<ConfigFieldOf, { type: "multiselect" }>;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(value), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return field.options;
    return field.options.filter(
      (option) =>
        option.label.toLowerCase().includes(q) ||
        (option.description ?? "").toLowerCase().includes(q),
    );
  }, [field.options, query]);

  const toggle = (option: string) => {
    const next = new Set(selected);
    if (next.has(option)) next.delete(option);
    else next.add(option);
    // Urutan katalog dipertahankan supaya diff antar publish tetap terbaca.
    onChange(field.options.filter((entry) => next.has(entry.value)).map((entry) => entry.value));
  };

  const searchable = field.options.length > 8;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
          {field.label}
        </span>
        <span className="tabular-money text-[10px] text-ink-muted">
          {selected.size}/{field.options.length}
        </span>
      </div>

      {searchable && (
        <div className="relative mt-1.5">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted"
            strokeWidth={2.2}
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Cari dari ${field.options.length} pilihan…`}
            aria-label={`Cari ${field.label}`}
            className={cn(inkInput, "h-9 pl-9 text-xs")}
          />
        </div>
      )}

      <div className="mt-1.5 flex gap-1.5">
        <button
          type="button"
          onClick={() => onChange(field.options.map((option) => option.value))}
          className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg border border-ink-border px-2 text-[10px] font-semibold text-ink-muted outline-none transition-colors hover:text-ink-foreground focus-visible:ring-3 focus-visible:ring-brand-glow/40"
        >
          <CheckSquare aria-hidden className="size-3" strokeWidth={2.4} />
          Pilih semua
        </button>
        <button
          type="button"
          onClick={() => onChange([])}
          className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg border border-ink-border px-2 text-[10px] font-semibold text-ink-muted outline-none transition-colors hover:text-ink-foreground focus-visible:ring-3 focus-visible:ring-brand-glow/40"
        >
          <Square aria-hidden className="size-3" strokeWidth={2.4} />
          Kosongkan
        </button>
      </div>

      <ul
        className={cn(
          "mt-1.5 space-y-0.5 rounded-xl border border-ink-border/70 bg-ink/40 p-1.5",
          searchable && "max-h-64 overflow-y-auto",
        )}
      >
        {filtered.length === 0 && (
          <li className="px-2 py-4 text-center text-[11px] text-ink-muted">Tidak ada yang cocok.</li>
        )}
        {filtered.map((option) => {
          const on = selected.has(option.value);
          return (
            <li key={option.value}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-ink-soft/70",
                  "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-brand-glow/40",
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(option.value)}
                  className="mt-0.5 size-3.5 shrink-0 cursor-pointer accent-[var(--brand-glow)] outline-none"
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-[11px] font-semibold",
                      on ? "text-ink-foreground" : "text-ink-muted",
                    )}
                  >
                    {option.label}
                  </span>
                  {option.description && (
                    <span className="block truncate text-[10px] text-ink-muted/80">
                      {option.description}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {field.hint && <p className="mt-1.5 text-[10px] text-ink-muted">{field.hint}</p>}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  disabledHint,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  disabledHint?: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-xl border border-ink-border/70 bg-ink/40 px-3 py-2.5",
        disabled && "opacity-60",
      )}
    >
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-ink-foreground">{label}</span>
        {(disabled ? disabledHint : hint) && (
          <span className="mt-0.5 block text-[10px] leading-snug text-ink-muted">
            {disabled ? disabledHint : hint}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full outline-none transition-colors duration-200",
          "focus-visible:ring-3 focus-visible:ring-brand-glow/40",
          checked ? "bg-brand-glow" : "bg-ink-border",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-ink transition-[left] duration-200",
            checked ? "left-[1.125rem]" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}
