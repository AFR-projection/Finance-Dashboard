import { cookies } from "next/headers";
import { ACCESS_COOKIE } from "@/lib/access-session";

export async function POST() {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  return Response.json({ ok: true });
}
