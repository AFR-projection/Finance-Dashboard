"use client";

/**
 * Uji coba draft terhadap satu pesan contoh.
 *
 * Dirender tanpa chrome panel: pembungkusnya milik halaman, dan halaman itu yang
 * tahu graph mana yang sedang diuji — draft atau yang dipublish. Komponen ini
 * hanya bertugas mengirim satu pesan dan menggambar hasilnya.
 */

import { useState } from "react";
import { Loader2, Send, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tone, inkInput } from "@/components/admin/ui";
import type { AgentGraphData } from "./shared";

type TestResult = {
  text: string;
  toolsUsed: string[];
  ms: number;
  blockedTools: string[];
};

export function TestPanel({ graph }: { graph: AgentGraphData }) {
  const [message, setMessage] = useState("berapa saldo saya sekarang?");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/agent-graph/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, graph }),
      });
      const json = await res.json();
      if (!json.ok) setError(json.error ?? "Uji coba gagal.");
      else setResult(json.data as TestResult);
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 px-4 py-3.5">
      <p className="flex items-start gap-2 text-[11px] leading-snug text-ink-muted">
        <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-brand-glow" strokeWidth={2.2} />
        Dijalankan atas nama akun admin ini, dengan seluruh tool yang bisa mengubah data dicabut
        dari rencana — bukan sekadar dilarang, tapi tidak pernah ikut dikirim.
      </p>

      <div className="flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Pesan contoh</span>
          <input
            type="text"
            value={message}
            maxLength={500}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && !busy && message.trim() && void run()}
            placeholder="Tulis pesan contoh…"
            className={cn(inkInput, "h-10")}
          />
        </label>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || !message.trim()}
          className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-ink-border px-3.5 text-xs font-semibold text-ink-muted outline-none transition-colors hover:border-ink-muted/40 hover:text-ink-foreground focus-visible:ring-3 focus-visible:ring-brand-glow/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? (
            <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2.4} />
          ) : (
            <Send aria-hidden className="size-3.5" strokeWidth={2.4} />
          )}
          Kirim
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-400/30 bg-rose-500/8 px-3 py-2 text-xs text-rose-200"
        >
          {error}
        </p>
      )}

      {result && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Tone tone="positive">{result.ms} ms</Tone>
            {result.toolsUsed.length > 0 && (
              <Tone tone="info">tool dipakai: {result.toolsUsed.join(", ")}</Tone>
            )}
            {result.blockedTools.length > 0 && (
              <Tone tone="warning">
                <span className="tabular-money">{result.blockedTools.length}</span>
                tool penulis dicabut demi keamanan uji coba
              </Tone>
            )}
          </div>
          <p className="whitespace-pre-wrap rounded-xl border border-ink-border/70 bg-ink/40 px-3 py-2.5 text-xs leading-relaxed text-ink-foreground">
            {result.text}
          </p>
        </div>
      )}
    </div>
  );
}
