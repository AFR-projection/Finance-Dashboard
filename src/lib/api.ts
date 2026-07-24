import { FinanceEngineError } from "@/finance-engine";
import { rateLimit } from "@/lib/rate-limit";
import { getAccessSession } from "@/lib/access-session";
import { getAppConfig, requireOwnerUserId } from "@/lib/app-config";
import { NextResponse } from "next/server";

export async function requireUser() {
  const cfg = await getAppConfig();
  if (!cfg.isReady) {
    throw new FinanceEngineError("Setup belum selesai", "SETUP_REQUIRED", 503);
  }
  const session = await getAccessSession();
  if (!session?.userId) {
    throw new FinanceEngineError("Unauthorized", "UNAUTHORIZED", 401);
  }
  const ownerId = await requireOwnerUserId();
  if (session.userId !== ownerId) {
    throw new FinanceEngineError("Unauthorized", "UNAUTHORIZED", 401);
  }
  return { id: session.userId };
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function jsonError(error: unknown) {
  if (error instanceof FinanceEngineError) {
    return NextResponse.json(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  console.error(error);
  return NextResponse.json(
    { ok: false, error: { code: "INTERNAL", message: "Internal server error" } },
    { status: 500 },
  );
}

export async function withApiGuard(
  request: Request,
  handler: (userId: string) => Promise<Response>,
  options?: { rateLimitKey?: string; limit?: number },
) {
  try {
    const user = await requireUser();
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const key = `${options?.rateLimitKey ?? "api"}:${user.id}:${ip}`;
    const rl = rateLimit(key, options?.limit);
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: { code: "RATE_LIMITED", message: "Too many requests" } },
        { status: 429 },
      );
    }
    return await handler(user.id);
  } catch (error) {
    return jsonError(error);
  }
}
