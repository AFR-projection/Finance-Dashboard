import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { getAccessSession, touchAccessSession } from "@/lib/access-session";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts only checks the signature; revocation is enforced here.
  const session = await getAccessSession();
  if (!session) redirect("/access");
  await touchAccessSession(session.sessionId);

  return (
    <div className="flex min-h-screen bg-[oklch(0.97_0.008_145)]">
      <div className="sticky top-0 hidden h-screen md:block">
        <AppSidebar />
      </div>
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
          <MobileNav />
          {children}
        </div>
      </main>
    </div>
  );
}
