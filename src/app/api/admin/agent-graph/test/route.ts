/**
 * Tombol "Jalankan tes" — menjalankan draft terhadap satu pesan contoh.
 *
 * Dijalankan atas nama admin yang menekan tombolnya, bukan atas nama user acak:
 * konteks keuangan yang masuk ke prompt adalah data admin itu sendiri, jadi
 * uji coba tidak pernah membuka angka milik orang lain.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { runFinanceAgent } from "@/ai/agent";
import { compileGraph } from "@/ai/graph/compile";
import { toDryRunPlan } from "@/ai/graph/dry-run";
import { AGENT_NODE_KINDS } from "@/ai/graph/types";
import { resolveAiConfig } from "@/ai/resolve-config";
import { getAdminSession } from "@/lib/admin-session";
import type { AgentGraphData } from "@/ai/graph/types";

export const dynamic = "force-dynamic";

const schema = z.object({
  message: z.string().min(1).max(500),
  graph: z.object({
    nodes: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          kind: z.enum(AGENT_NODE_KINDS),
          label: z.string().max(80).optional(),
          enabled: z.boolean(),
          position: z.object({ x: z.number(), y: z.number() }),
          config: z.record(z.string(), z.unknown()).default({}),
        }),
      )
      .min(1)
      .max(60),
    edges: z
      .array(
        z.object({
          id: z.string().min(1).max(96),
          source: z.string().min(1).max(64),
          target: z.string().min(1).max(64),
        }),
      )
      .max(200),
  }),
});

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    const body = schema.parse(await request.json());
    const compiled = compileGraph(body.graph as AgentGraphData);
    const errors = compiled.issues.filter((issue) => issue.level === "error");

    if (errors.length > 0 || !compiled.chat) {
      return NextResponse.json(
        {
          ok: false,
          error: errors[0]?.message ?? "Jalur chat belum lengkap — tidak ada yang bisa diuji.",
          data: { issues: compiled.issues },
        },
        { status: 400 },
      );
    }

    const { plan, blockedTools } = toDryRunPlan(compiled.chat);
    const config = await resolveAiConfig(admin.userId);
    if (!config.apiKey) {
      return NextResponse.json(
        { ok: false, error: "API key AI belum diisi. Buka halaman AI & Model." },
        { status: 400 },
      );
    }

    const startedAt = Date.now();
    // Kanal dipaksa WEB: node pemicu yang cuma melayani Telegram tidak boleh
    // membuat tombol tes selalu tertolak.
    const reply = await runFinanceAgent({
      userId: admin.userId,
      message: body.message,
      config,
      channel: "WEB",
      plan: { ...plan, channels: ["WEB"] },
    });

    return NextResponse.json({
      ok: true,
      data: {
        text: reply.text,
        toolsUsed: reply.toolsUsed,
        usage: reply.usage ?? null,
        ms: Date.now() - startedAt,
        // Ditampilkan apa adanya di konsol: admin harus tahu bahwa hasil tes
        // ini tidak mewakili perilaku penuh graph-nya.
        blockedTools,
        issues: compiled.issues,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fields = [...new Set(error.issues.map((issue) => issue.path.join(".")))];
      return NextResponse.json(
        { ok: false, error: `Nilai tidak valid pada: ${fields.join(", ")}` },
        { status: 400 },
      );
    }
    console.error("[agent-graph/test] gagal:", error);
    return NextResponse.json({ ok: false, error: "Uji coba gagal dijalankan." }, { status: 500 });
  }
}
