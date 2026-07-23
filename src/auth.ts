import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { FinanceEngine } from "@/finance-engine";
import { getLoginSession, deleteLoginSession } from "@/lib/login-session";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).optional(),
  ticket: z.string().min(16).optional(),
  sessionId: z.string().min(8).optional(),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
          }),
        ]
      : []),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        ticket: { label: "Ticket", type: "text" },
        sessionId: { label: "Session", type: "text" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();

        if (parsed.data.ticket && parsed.data.sessionId) {
          const session = await getLoginSession(parsed.data.sessionId);
          if (
            !session ||
            session.status !== "approved" ||
            session.ticket !== parsed.data.ticket ||
            session.email.toLowerCase() !== email
          ) {
            return null;
          }
          const user = await prisma.user.findUnique({ where: { email } });
          if (!user) return null;
          await deleteLoginSession(parsed.data.sessionId);
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
          };
        }

        if (!parsed.data.password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (!user.id) return;
      await FinanceEngine.ensureUserSettings(user.id);
      await FinanceEngine.ensureDefaultCategories(user.id);
    },
  },
});
