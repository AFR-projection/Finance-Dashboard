import { OverviewClient } from "@/components/admin/overview-client";
import { readAdminPulse, readGrowthSeries, readRecentEvents } from "@/lib/admin-metrics";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const [pulse, growth, events] = await Promise.all([
    readAdminPulse(),
    readGrowthSeries(30),
    readRecentEvents(25),
  ]);

  return <OverviewClient initialPulse={pulse} initialEvents={events} growth={growth} />;
}
