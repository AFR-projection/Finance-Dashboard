import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { FinanceEngineError } from "@/finance-engine";
import { rateLimit } from "@/lib/rate-limit";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new FinanceEngineError("Unauthorized", "UNAUTHORIZED", 401);
  }
  return session.user;
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
        { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
      );
    }
    return await handler(user.id);
  } catch (error) {
    return jsonError(error);
  }
}
