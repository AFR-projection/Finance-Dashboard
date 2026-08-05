/**
 * Kerangka bersama seluruh halaman Agent Studio.
 *
 * Layout ini sengaja tipis — hanya satu baris identitas seksi plus tab. Judul
 * besar `PageHeader` ditulis masing-masing halaman, bukan di sini, karena halaman
 * Kanvas tidak boleh punya satu pun: ia workspace setinggi viewport, dan tiap
 * rem yang diambil header di atasnya langsung dipotong dari tinggi kanvas.
 */

import { Workflow } from "lucide-react";
import { AgentNav } from "@/components/admin/agent-studio/agent-nav";

export default function AgentSectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-col gap-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink-border/70 pb-4">
        <span className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink-soft text-brand-glow">
            <Workflow aria-hidden className="size-4.5" strokeWidth={2.2} />
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-brand-glow">
              Platform
            </span>
            <span className="block truncate text-sm font-bold tracking-[-0.01em] text-ink-foreground">
              Agent Studio
            </span>
          </span>
        </span>

        <div className="min-w-0 flex-1 lg:flex lg:justify-end">
          <AgentNav />
        </div>
      </div>

      {children}
    </div>
  );
}
