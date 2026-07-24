import { redirect } from "next/navigation";
import { getAppConfig } from "@/lib/app-config";
import { getAccessSession } from "@/lib/access-session";

export default async function HomePage() {
  const cfg = await getAppConfig();
  if (!cfg.isReady) redirect("/setup");

  const session = await getAccessSession();
  if (session?.userId) redirect("/dashboard");

  redirect("/access");
}
