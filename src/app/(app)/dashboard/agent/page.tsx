"use client";

import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Msg = { role: "user" | "assistant"; text: string };

export default function AgentPage() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: 'Halo! Saya siap membantu mencatat transaksi dan menganalisis keuangan Anda. Coba kirim "beli kopi 25 ribu" atau "bagaimana kondisi keuangan bulan ini?"',
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const userText = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", text: userText }]);
    setLoading(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText, channel: "WEB" }),
      });
      const json = await res.json();
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: json.data?.text ?? json.error?.message ?? "Gagal memproses.",
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Koneksi bermasalah. Silakan coba lagi sebentar lagi." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-6rem)] max-w-3xl flex-col">
      <div className="mb-4">
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-primary">AI Agent</h1>
        <p className="text-muted-foreground">
          Catat transaksi, pahami arus kas, dan susun langkah keuangan berikutnya.
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-border/60 bg-white/60 p-4">
        {messages.map((m, i) => (
          <motion.div
            key={`${i}-${m.text.slice(0, 12)}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              m.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "bg-white text-foreground shadow-sm"
            }`}
          >
            <p className="whitespace-pre-wrap">{m.text}</p>
          </motion.div>
        ))}
        {loading && <p className="text-sm text-muted-foreground">Menganalisis...</p>}
      </div>

      <form onSubmit={onSubmit} className="mt-4 flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Saya beli makan 35 ribu..."
          className="min-h-[52px] resize-none bg-white"
        />
        <Button type="submit" disabled={loading}>
          Kirim
        </Button>
      </form>
    </div>
  );
}
