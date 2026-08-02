import { prisma } from "@/lib/db";
import { emitAdminEvent } from "@/lib/admin-realtime";
import type { AdminEvent } from "@/lib/admin-metrics";

type RecordInput = {
  actor: { userId: string; name?: string | null; username?: string | null };
  action: string;
  summary: string;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
  ip?: string | null;
  tone?: AdminEvent["tone"];
};

/**
 * Writes the audit row and lights up every open console in one call.
 *
 * Never throws: an admin action that already succeeded must not be reported as
 * a failure just because its bookkeeping did.
 */
export async function recordAdminAction(input: RecordInput) {
  const actorName = input.actor.username
    ? `@${input.actor.username}`
    : input.actor.name || "admin";

  try {
    await prisma.adminAuditLog.create({
      data: {
        actorUserId: input.actor.userId,
        actorName,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        summary: input.summary,
        meta: (input.meta as never) ?? undefined,
        ip: input.ip ?? null,
      },
    });
  } catch (error) {
    console.warn("[admin-audit] gagal mencatat aksi:", error);
  }

  emitAdminEvent({
    kind: input.action as AdminEvent["kind"],
    summary: input.summary,
    actor: actorName,
    tone: input.tone ?? "neutral",
  });
}

/** Best-effort client IP, matching how the rest of the app reads proxy headers. */
export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip");
}
