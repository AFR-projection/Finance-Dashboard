import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { getAccessSession, touchAccessSession } from "@/lib/access-session";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts only checks the signature; revocation is enforced here.
  const session = await getAccessSession();
  if (!session) redirect("/masuk");
  await touchAccessSession(session.sessionId);

  return (
    <div className="flex min-h-svh bg-background">
      <div className="sticky top-0 hidden h-svh shrink-0 lg:block">
        <AppSidebar />
      </div>
      <main className="min-w-0 flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-[90rem] px-4 pb-28 lg:px-8 lg:pb-10 xl:px-10">
          <MobileNav />
          {children}
        </div>
      </main>
      <InstallPrompt />
    </div>
  );
}
