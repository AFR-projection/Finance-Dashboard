import { FinanceEngineError } from "@/finance-engine";
import { rateLimit } from "@/lib/rate-limit";
import { getAccessSession } from "@/lib/access-session";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export type AuthedUser = {
  id: string;
  role: "USER" | "ADMIN";
};

export async function requireUser(): Promise<AuthedUser> {
  const session = await getAccessSession();
  if (!session?.userId) {
    throw new FinanceEngineError("Unauthorized", "UNAUTHORIZED", 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, status: true },
  });
  if (!user) {
    throw new FinanceEngineError("Unauthorized", "UNAUTHORIZED", 401);
  }
  if (user.status === "SUSPENDED") {
    throw new FinanceEngineError("Akun ditangguhkan", "SUSPENDED", 403);
  }

  return { id: user.id, role: user.role };
}

export async function requireAdmin(): Promise<AuthedUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    throw new FinanceEngineError("Butuh akses admin", "FORBIDDEN", 403);
  }
  return user;
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
  options?: { rateLimitKey?: string; limit?: number; adminOnly?: boolean },
) {
  try {
    const user = options?.adminOnly ? await requireAdmin() : await requireUser();
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
