/**
 * Muat, simpan draft, publish, dan rollback graph agent.
 *
 * Pemisahan draft/published bukan kenyamanan UI — ini pengaman. Admin yang
 * sedang menggeser node tidak boleh mengubah perilaku agent yang saat itu juga
 * sedang mencatat transaksi user. Hanya publish yang menyentuh kolom yang
 * dibaca runtime, dan graph yang tidak lolos validasi tidak pernah sampai ke
 * sana.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { AGENT_NODE_KINDS } from "@/ai/graph/types";
import { validateGraph } from "@/ai/graph/compile";
import { readGraphRecord, invalidateGraphCache } from "@/ai/graph/store";
import { NODE_DEFINITION_LIST } from "@/ai/graph/catalogue";
import { DEFAULT_GRAPH } from "@/ai/graph/default-graph";
import { clientIp, recordAdminAction } from "@/lib/admin-audit";
import { getAdminSession } from "@/lib/admin-session";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AgentGraphData } from "@/ai/graph/types";

export const dynamic = "force-dynamic";

const nodeSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(AGENT_NODE_KINDS),
  label: z.string().max(80).optional(),
  enabled: z.boolean(),
  position: z.object({ x: z.number(), y: z.number() }),
  config: z.record(z.string(), z.unknown()).default({}),
});

// Node & edge sudah divalidasi ketat oleh Zod di atas, tapi Prisma menolak
// array sebagai input Json karena tipenya minta object ber-index-signature.
// Cast ini menutup jarak tipe itu tanpa melonggarkan validasinya.
const asJson = (value: unknown) => value as Prisma.InputJsonValue;

const edgeSchema = z.object({
  id: z.string().min(1).max(96),
  source: z.string().min(1).max(64),
  target: z.string().min(1).max(64),
});

// Batas atas ada supaya satu request tidak bisa menaruh graph raksasa yang
// harus dikompilasi ulang tiap pesan masuk.
const graphSchema = z.object({
  nodes: z.array(nodeSchema).min(1).max(60),
  edges: z.array(edgeSchema).max(200),
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save-draft"), graph: graphSchema }),
  z.object({ action: z.literal("discard-draft") }),
  z.object({ action: z.literal("publish"), graph: graphSchema, note: z.string().max(200).optional() }),
  z.object({ action: z.literal("rollback"), version: z.number().int().min(1) }),
]);

async function loadPayload() {
  const [record, revisions] = await Promise.all([
    readGraphRecord(),
    prisma.agentGraphRevision.findMany({
      orderBy: { version: "desc" },
      take: 20,
      select: { version: true, note: true, actorUserId: true, createdAt: true },
    }),
  ]);

  return {
    version: record.version,
    published: record.published,
    draft: record.draft,
    publishedAt: record.publishedAt,
    updatedBy: record.updatedBy,
    revisions,
    catalogue: NODE_DEFINITION_LIST,
    // Dikirim supaya tombol "Kembalikan ke bawaan" tidak perlu menebak-nebak.
    defaultGraph: DEFAULT_GRAPH,
    issues: validateGraph(record.draft ?? record.published),
  };
}

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json({ ok: true, data: await loadPayload() });
  } catch (error) {
    console.error("[agent-graph] gagal memuat:", error);
    return NextResponse.json({ ok: false, error: "Gagal memuat graph." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    const body = bodySchema.parse(await request.json());

    if (body.action === "save-draft") {
      // Draft sengaja BOLEH tidak valid: admin menyusun bertahap, dan memaksa
      // graph selalu benar di tiap penyimpanan akan membuat kerja setengah jadi
      // mustahil disimpan. Yang dijaga ketat adalah publish.
      await prisma.agentGraph.upsert({
        where: { id: "singleton" },
        create: {
          id: "singleton",
          nodes: [],
          edges: [],
          draftNodes: asJson(body.graph.nodes),
          draftEdges: asJson(body.graph.edges),
          updatedBy: admin.userId,
        },
        update: {
          draftNodes: asJson(body.graph.nodes),
          draftEdges: asJson(body.graph.edges),
          updatedBy: admin.userId,
        },
      });
      return NextResponse.json({
        ok: true,
        data: { issues: validateGraph(body.graph as AgentGraphData) },
      });
    }

    if (body.action === "discard-draft") {
      await prisma.agentGraph.updateMany({
        where: { id: "singleton" },
        data: { draftNodes: Prisma.DbNull, draftEdges: Prisma.DbNull },
      });
      return NextResponse.json({ ok: true, data: await loadPayload() });
    }

    if (body.action === "publish") {
      const graph = body.graph as AgentGraphData;
      const issues = validateGraph(graph);
      const errors = issues.filter((issue) => issue.level === "error");
      if (errors.length > 0) {
        return NextResponse.json(
          { ok: false, error: errors[0].message, data: { issues } },
          { status: 400 },
        );
      }

      const current = await prisma.agentGraph.findUnique({
        where: { id: "singleton" },
        select: { version: true },
      });
      const version = (current?.version ?? 0) + 1;

      await prisma.$transaction([
        prisma.agentGraph.upsert({
          where: { id: "singleton" },
          create: {
            id: "singleton",
            version,
            nodes: asJson(graph.nodes),
            edges: asJson(graph.edges),
            draftNodes: Prisma.DbNull,
            draftEdges: Prisma.DbNull,
            publishedAt: new Date(),
            updatedBy: admin.userId,
          },
          update: {
            version,
            nodes: asJson(graph.nodes),
            edges: asJson(graph.edges),
            // Draft dibersihkan supaya kanvas tidak terus menampilkan lencana
            // "ada perubahan belum dipublish" untuk perubahan yang barusan naik.
            draftNodes: Prisma.DbNull,
            draftEdges: Prisma.DbNull,
            publishedAt: new Date(),
            updatedBy: admin.userId,
          },
        }),
        prisma.agentGraphRevision.create({
          data: {
            version,
            nodes: asJson(graph.nodes),
            edges: asJson(graph.edges),
            actorUserId: admin.userId,
            note: body.note ?? null,
          },
        }),
      ]);

      invalidateGraphCache();
      await recordAdminAction({
        actor: admin,
        action: "agent.publish",
        summary: `Mem-publish graph agent v${version} (${graph.nodes.length} node)`,
        targetType: "agent-graph",
        targetId: "singleton",
        meta: { version, nodes: graph.nodes.length, edges: graph.edges.length },
        tone: "warning",
        ip: clientIp(request),
      });

      return NextResponse.json({ ok: true, data: await loadPayload() });
    }

    // rollback
    const revision = await prisma.agentGraphRevision.findUnique({
      where: { version: body.version },
    });
    if (!revision) {
      return NextResponse.json({ ok: false, error: "Revisi tidak ditemukan." }, { status: 404 });
    }

    const current = await prisma.agentGraph.findUnique({
      where: { id: "singleton" },
      select: { version: true },
    });
    // Rollback ditulis sebagai versi BARU, bukan mundurnya angka versi. Riwayat
    // yang bisa mundur membuat "v7" menunjuk dua graph berbeda.
    const version = (current?.version ?? 0) + 1;

    await prisma.$transaction([
      prisma.agentGraph.update({
        where: { id: "singleton" },
        data: {
          version,
          nodes: revision.nodes as never,
          edges: revision.edges as never,
          draftNodes: Prisma.DbNull,
          draftEdges: Prisma.DbNull,
          publishedAt: new Date(),
          updatedBy: admin.userId,
        },
      }),
      prisma.agentGraphRevision.create({
        data: {
          version,
          nodes: revision.nodes as never,
          edges: revision.edges as never,
          actorUserId: admin.userId,
          note: `Rollback ke v${revision.version}`,
        },
      }),
    ]);

    invalidateGraphCache();
    await recordAdminAction({
      actor: admin,
      action: "agent.rollback",
      summary: `Mengembalikan graph agent ke v${revision.version} (tercatat sebagai v${version})`,
      targetType: "agent-graph",
      targetId: "singleton",
      meta: { restoredFrom: revision.version, version },
      tone: "warning",
      ip: clientIp(request),
    });

    return NextResponse.json({ ok: true, data: await loadPayload() });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fields = [...new Set(error.issues.map((issue) => issue.path.join(".")))];
      return NextResponse.json(
        { ok: false, error: `Nilai tidak valid pada: ${fields.join(", ")}` },
        { status: 400 },
      );
    }
    console.error("[agent-graph] gagal menyimpan:", error);
    return NextResponse.json({ ok: false, error: "Gagal menyimpan graph." }, { status: 500 });
  }
}
