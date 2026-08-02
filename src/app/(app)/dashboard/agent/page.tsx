"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Bot,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  CircleDollarSign,
  Eraser,
  Send,
  ShieldCheck,
  Sparkles,
  WalletCards,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type WalletPrompt = {
  pendingId: string;
  question: string;
  wallets: Array<{ id: string; name: string; currency: string }>;
};

type Msg = {
  role: "user" | "assistant";
  text: string;
  walletPrompt?: WalletPrompt;
  toolsUsed?: string[];
};

const suggestions = [
  { label: "Catat makan 35 ribu", icon: CircleDollarSign },
  { label: "Cek kondisi keuangan bulan ini", icon: ChartNoAxesCombined },
  { label: "Rekening mana yang paling aktif?", icon: WalletCards },
];

const welcomeMessage: Msg = {
  role: "assistant",
  text: "Halo, saya Copilot keuanganmu. Saya bisa mencatat transaksi, membaca pola pengeluaran, mengawasi budget, dan membantu mengambil keputusan dari data yang benar-benar tercatat.",
};

export default function AgentPage() {
  const [messages, setMessages] = useState<Msg[]>([welcomeMessage]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  async function sendMessage(text: string) {
    const userText = text.trim();
    if (!userText || loading) return;
    setInput("");
    setMessages((current) => [...current, { role: "user", text: userText }]);
    setLoading(true);
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText, channel: "WEB" }),
      });
      const json = await response.json();
      // Each pending draft becomes its own message so every one of them gets a
      // full set of account buttons. Batching them into a single bubble would
      // leave all but the first draft unconfirmable.
      const prompts: WalletPrompt[] =
        json.data?.walletPrompts ?? (json.data?.walletPrompt ? [json.data.walletPrompt] : []);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: json.data?.text ?? json.error?.message ?? "Permintaan belum berhasil diproses.",
          toolsUsed: json.data?.toolsUsed,
          walletPrompt: prompts[0],
        },
        ...prompts.slice(1).map((prompt) => ({
          role: "assistant" as const,
          text: prompt.question,
          walletPrompt: prompt,
        })),
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        { role: "assistant", text: "Koneksi bermasalah. Coba lagi sebentar lagi." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void sendMessage(input);
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  }

  async function clearConversation() {
    await fetch("/api/agent", { method: "DELETE" });
    setMessages([welcomeMessage]);
  }

  async function chooseWallet(
    messageIndex: number,
    prompt: WalletPrompt,
    wallet: { id: string; name: string } | null,
  ) {
    if (loading) return;
    setMessages((current) => [
      ...current.map((message, index) =>
        index === messageIndex ? { ...message, walletPrompt: undefined } : message,
      ),
      { role: "user", text: wallet ? `Gunakan rekening ${wallet.name}` : "Batalkan transaksi" },
    ]);
    setLoading(true);
    try {
      const response = await fetch("/api/agent/wallet-choice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pendingId: prompt.pendingId,
          walletId: wallet?.id,
          action: wallet ? "confirm" : "cancel",
        }),
      });
      const json = await response.json();
      setMessages((current) => [
        ...current,
        { role: "assistant", text: json.data?.text ?? json.error?.message ?? "Pilihan rekening belum berhasil diproses." },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        { role: "assistant", text: "Koneksi bermasalah. Pilihan rekening belum diproses." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100svh-9.2rem)] min-h-[34rem] flex-col pt-1 lg:h-[calc(100svh-3rem)] lg:pt-6">
      <header className="mb-3 flex items-center justify-between gap-3 lg:mb-5">
        <div className="flex items-center gap-3">
          <span className="relative grid size-11 place-items-center rounded-2xl bg-[linear-gradient(135deg,var(--primary),oklch(0.45_0.11_190))] text-primary-foreground shadow-lg">
            <Bot className="size-5" />
            <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-background bg-emerald-400" />
          </span>
          <div>
            <h1 className="text-base font-bold tracking-[-0.03em] sm:text-lg">Ledgerly Copilot</h1>
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
              <ShieldCheck className="size-3 text-emerald-600" /> Tool-first · Data terverifikasi
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon-lg" className="rounded-xl text-muted-foreground" onClick={() => void clearConversation()} aria-label="Bersihkan percakapan">
          <Eraser className="size-4" />
        </Button>
      </header>

      <section className="app-surface hide-scrollbar flex-1 space-y-5 overflow-y-auto rounded-[1.6rem] p-3 sm:p-5 lg:rounded-[2rem] lg:p-6">
        {messages.map((message, index) => (
          <motion.div key={`${index}-${message.text.slice(0, 12)}`} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} className={message.role === "user" ? "ml-auto max-w-[88%] sm:max-w-[75%]" : "max-w-[95%] sm:max-w-[82%]"}>
            {message.role === "assistant" && (
              <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                <WandSparkles className="size-3 text-primary" /> Copilot
              </div>
            )}
            <div className={message.role === "user" ? "rounded-[1.4rem] rounded-br-md bg-primary px-4 py-3 text-[13px] leading-relaxed text-primary-foreground shadow-md" : "rounded-[1.4rem] rounded-tl-md border border-border/60 bg-background/70 px-4 py-3.5 text-[13px] leading-relaxed text-foreground shadow-sm"}>
              <p className="whitespace-pre-wrap">{message.text}</p>
              {message.role === "assistant" && message.toolsUsed && message.toolsUsed.length > 0 && (
                <div className="mt-3 flex items-center gap-1.5 border-t border-border/50 pt-2.5 text-[9px] font-semibold text-muted-foreground">
                  <Check className="size-3 text-emerald-600" /> {message.toolsUsed.length} tool selesai
                </div>
              )}
              {message.role === "assistant" && message.walletPrompt && (
                <div className="mt-3 grid gap-2">
                  {message.walletPrompt.wallets.map((wallet) => (
                    <button key={wallet.id} type="button" disabled={loading} onClick={() => void chooseWallet(index, message.walletPrompt!, wallet)} className="flex min-h-11 items-center justify-between rounded-xl border border-border/70 bg-card px-3 text-left text-xs font-semibold transition-colors hover:border-primary/30 hover:bg-primary/5">
                      <span className="flex items-center gap-2"><WalletCards className="size-3.5 text-primary" />{wallet.name}</span>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">{wallet.currency}<ChevronRight className="size-3" /></span>
                    </button>
                  ))}
                  <button type="button" disabled={loading} onClick={() => void chooseWallet(index, message.walletPrompt!, null)} className="min-h-9 text-[10px] font-semibold text-muted-foreground">Batalkan transaksi</button>
                </div>
              )}
            </div>
          </motion.div>
        ))}

        {messages.length === 1 && (
          <div className="grid gap-2 pt-1 sm:grid-cols-3">
            {suggestions.map((suggestion) => {
              const Icon = suggestion.icon;
              return (
                <button key={suggestion.label} type="button" onClick={() => void sendMessage(suggestion.label)} className="flex min-h-14 items-center gap-3 rounded-2xl border border-border/60 bg-muted/45 px-3 text-left text-[11px] font-medium transition-colors hover:bg-muted">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-card text-primary shadow-sm"><Icon className="size-4" /></span>
                  {suggestion.label}
                </button>
              );
            })}
          </div>
        )}

        {loading && (
          <div className="flex max-w-[80%] items-center gap-2 rounded-2xl rounded-tl-md border border-border/60 bg-background/70 px-4 py-3 text-[11px] text-muted-foreground">
            <Sparkles className="size-3.5 animate-pulse text-primary" />
            <span>Menjalankan tool</span>
            <span className="flex gap-1"><i className="size-1 animate-bounce rounded-full bg-primary/50" /><i className="size-1 animate-bounce rounded-full bg-primary/50 [animation-delay:120ms]" /><i className="size-1 animate-bounce rounded-full bg-primary/50 [animation-delay:240ms]" /></span>
          </div>
        )}
        <div ref={endRef} />
      </section>

      <form onSubmit={onSubmit} className="app-surface mt-3 flex items-end gap-2 rounded-[1.4rem] p-2 lg:mt-4">
        <Textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={onComposerKeyDown} placeholder="Catat transaksi atau tanya kondisi keuangan..." className="max-h-28 min-h-11 resize-none border-0 bg-transparent px-3 py-3 text-[13px] shadow-none focus-visible:ring-0" />
        <Button type="submit" size="icon-lg" disabled={loading || !input.trim()} className="size-11 rounded-2xl shadow-md" aria-label="Kirim pesan">
          <Send className="size-4" />
        </Button>
      </form>
      <p className="mt-1.5 hidden text-center text-[9px] text-muted-foreground lg:block">Enter untuk kirim · Shift + Enter untuk baris baru</p>
    </div>
  );
}
