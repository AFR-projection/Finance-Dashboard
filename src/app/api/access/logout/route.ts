import { cookies } from "next/headers";
import {
  ACCESS_COOKIE,
  getAccessSession,
  revokeAccessSession,
} from "@/lib/access-session";

export async function POST() {
  const session = await getAccessSession();
  if (session) await revokeAccessSession(session.sessionId);
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  return Response.json({ ok: true });
}
