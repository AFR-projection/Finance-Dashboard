import { prisma } from "@/lib/db";
import { currentPeriodKey } from "@/ai/usage";

/** Counters cheap enough to re-query every few seconds. */
export type AdminPulse = {
  at: string;
  users: { total: number; active: number; suspended: number; premium: number; new24h: number };
  sessions: { live: number; admin: number; pendingChallenges: number };
  ai: { tokensToday: number; requestsToday: number; tokensMonth: number };
  money: { revenueToday: number; revenueMonth: number; paidToday: number };
  activity: { transactions24h: number; transactions1h: number };
};

export type AdminEventKind =
  | "user.signup"
  | "user.suspend"
  | "user.activate"
  | "user.premium"
  | "payment.paid"
  | "payment.pending"
  | "config.update"
  | "admin.login"
  | "session.revoke"
  | "access.approved"
  | "access.rejected";

export type AdminEvent = {
  id: string;
  kind: AdminEventKind;
  summary: string;
  actor?: string | null;
  tone: "positive" | "neutral" | "warning" | "danger";
  at: string;
};

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

const PAID_STATUSES = ["settlement", "capture"];

/**
 * One round-trip for the whole snapshot.
 *
 * Neon charges a real network hop per query, and this runs on a timer, so the
 * aggregates are batched into a single interactive transaction rather than
 * fired as ~15 independent awaits.
 */
export async function readAdminPulse(): Promise<AdminPulse> {
  const now = new Date();
  const today = startOfToday();
  const month = startOfMonth();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const periodKey = currentPeriodKey(now);

  const [
    total,
    active,
    suspended,
    premium,
    new24h,
    liveSessions,
    adminSessions,
    pendingChallenges,
    aiToday,
    aiMonth,
    revenueToday,
    revenueMonth,
    transactions24h,
    transactions1h,
  ] = await prisma.$transaction([
    prisma.user.count(),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { status: "SUSPENDED" } }),
    prisma.subscription.count({ where: { tier: "PREMIUM", currentPeriodEnd: { gt: now } } }),
    prisma.user.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.accessSession.count({
      where: { scope: "USER", revokedAt: null, expiresAt: { gt: now } },
    }),
    prisma.accessSession.count({
      where: { scope: "ADMIN", revokedAt: null, expiresAt: { gt: now } },
    }),
    prisma.accessChallenge.count({ where: { status: "PENDING", expiresAt: { gt: now } } }),
    prisma.aiUsageLog.aggregate({
      where: { createdAt: { gte: today } },
      _sum: { promptTokens: true, outputTokens: true },
      _count: { _all: true },
    }),
    prisma.aiUsageMonthly.aggregate({ where: { periodKey }, _sum: { tokens: true } }),
    prisma.payment.aggregate({
      where: { status: { in: PAID_STATUSES }, createdAt: { gte: today } },
      _sum: { grossAmount: true },
      _count: { _all: true },
    }),
    prisma.payment.aggregate({
      where: { status: { in: PAID_STATUSES }, createdAt: { gte: month } },
      _sum: { grossAmount: true },
    }),
    prisma.transaction.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.transaction.count({ where: { createdAt: { gte: hourAgo } } }),
  ]);

  return {
    at: now.toISOString(),
    users: { total, active, suspended, premium, new24h },
    sessions: { live: liveSessions, admin: adminSessions, pendingChallenges },
    ai: {
      tokensToday: (aiToday._sum.promptTokens ?? 0) + (aiToday._sum.outputTokens ?? 0),
      requestsToday: aiToday._count._all,
      tokensMonth: aiMonth._sum.tokens ?? 0,
    },
    money: {
      revenueToday: revenueToday._sum.grossAmount ?? 0,
      revenueMonth: revenueMonth._sum.grossAmount ?? 0,
      paidToday: revenueToday._count._all,
    },
    activity: { transactions24h, transactions1h },
  };
}

/** Daily buckets for the overview charts. Grouped in SQL, not in JS. */
export async function readGrowthSeries(days = 30) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  const [signups, revenue, tokens] = await Promise.all([
    prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', created_at) AS day, COUNT(*)::bigint AS count
      FROM users WHERE created_at >= ${since}
      GROUP BY 1 ORDER BY 1
    `,
    prisma.$queryRaw<{ day: Date; total: bigint }[]>`
      SELECT date_trunc('day', created_at) AS day, COALESCE(SUM(gross_amount), 0)::bigint AS total
      FROM payments
      WHERE created_at >= ${since} AND status IN ('settlement', 'capture')
      GROUP BY 1 ORDER BY 1
    `,
    prisma.$queryRaw<{ day: Date; source: string; total: bigint }[]>`
      SELECT date_trunc('day', created_at) AS day, source,
             COALESCE(SUM(prompt_tokens + output_tokens), 0)::bigint AS total
      FROM ai_usage_log WHERE created_at >= ${since}
      GROUP BY 1, 2 ORDER BY 1
    `,
  ]);

  const key = (d: Date) => d.toISOString().slice(0, 10);
  const signupMap = new Map(signups.map((r) => [key(r.day), Number(r.count)]));
  const revenueMap = new Map(revenue.map((r) => [key(r.day), Number(r.total)]));
  const chatMap = new Map<string, number>();
  const heartbeatMap = new Map<string, number>();
  for (const row of tokens) {
    (row.source === "HEARTBEAT" ? heartbeatMap : chatMap).set(key(row.day), Number(row.total));
  }

  return Array.from({ length: days }, (_, i) => {
    const date = new Date(since);
    date.setDate(since.getDate() + i);
    const k = key(date);
    return {
      date: k,
      label: date.toLocaleDateString("id-ID", { day: "numeric", month: "short" }),
      signups: signupMap.get(k) ?? 0,
      revenue: revenueMap.get(k) ?? 0,
      chatTokens: chatMap.get(k) ?? 0,
      heartbeatTokens: heartbeatMap.get(k) ?? 0,
    };
  });
}

/** Recent platform-wide happenings, assembled for the activity feed. */
export async function readRecentEvents(limit = 25): Promise<AdminEvent[]> {
  const [signups, payments, audits] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, username: true, name: true, createdAt: true },
    }),
    prisma.payment.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        status: true,
        grossAmount: true,
        createdAt: true,
        user: { select: { username: true, name: true } },
      },
    }),
    prisma.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: limit }),
  ]);

  const label = (u: { username: string | null; name: string | null }) =>
    u.username ? `@${u.username}` : u.name || "pengguna";

  const events: AdminEvent[] = [
    ...signups.map((u) => ({
      id: `signup-${u.id}`,
      kind: "user.signup" as const,
      summary: `${label(u)} mendaftar`,
      tone: "positive" as const,
      at: u.createdAt.toISOString(),
    })),
    ...payments.map((p) => {
      const paid = PAID_STATUSES.includes(p.status);
      return {
        id: `payment-${p.id}`,
        kind: (paid ? "payment.paid" : "payment.pending") as AdminEventKind,
        summary: paid
          ? `${label(p.user)} membayar ${formatIdr(p.grossAmount)}`
          : `${label(p.user)} memulai pembayaran (${p.status})`,
        tone: paid ? ("positive" as const) : ("neutral" as const),
        at: p.createdAt.toISOString(),
      };
    }),
    ...audits.map((a) => ({
      id: `audit-${a.id}`,
      kind: a.action as AdminEventKind,
      summary: a.summary,
      actor: a.actorName,
      tone: toneForAction(a.action),
      at: a.createdAt.toISOString(),
    })),
  ];

  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

function toneForAction(action: string): AdminEvent["tone"] {
  if (action.includes("suspend") || action.includes("revoke")) return "danger";
  if (action.includes("activate") || action.includes("premium")) return "positive";
  if (action.includes("login")) return "warning";
  return "neutral";
}

export function formatIdr(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}
