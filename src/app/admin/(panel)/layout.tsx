import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminSession } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Panel Admin",
  robots: { index: false, follow: false },
};

/**
 * Guards everything in the (panel) group. /admin/login sits outside it on
 * purpose — a guarded login page would redirect to itself forever.
 */
export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts only verified the signature; revocation and role are enforced here.
  const session = await getAdminSession();
  if (!session) redirect("/login");

  return (
    <AdminShell admin={{ name: session.name, username: session.username }}>{children}</AdminShell>
  );
}
