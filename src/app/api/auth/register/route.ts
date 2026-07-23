import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { FinanceEngine } from "@/finance-engine";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

const registerSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const rl = rateLimit(`register:${ip}`, 10, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
    }

    const body = registerSchema.parse(await request.json());
    const email = body.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ ok: false, error: "Email already registered" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email,
        passwordHash,
      },
    });

    await FinanceEngine.ensureUserSettings(user.id);
    await FinanceEngine.ensureDefaultCategories(user.id);

    return NextResponse.json({ ok: true, data: { id: user.id, email: user.email } }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: error.flatten() }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ ok: false, error: "Registration failed" }, { status: 500 });
  }
}
