import { getEntitlement } from "@/ai/entitlement";
import { getAppConfigRaw } from "@/lib/app-config";
import { jsonOk, withApiGuard } from "@/lib/api";

/** What the dashboard needs to render the subscription card. */
export async function GET(request: Request) {
  return withApiGuard(request, async (userId) => {
    const [entitlement, cfg] = await Promise.all([getEntitlement(userId), getAppConfigRaw()]);

    const daysLeft = entitlement.periodEnd
      ? Math.max(
          0,
          Math.ceil((entitlement.periodEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
        )
      : 0;

    return jsonOk({
      tier: entitlement.tier,
      quota: entitlement.quota,
      used: entitlement.used,
      // Infinity does not survive JSON, so unlimited is signalled by quota 0.
      remaining: entitlement.quota === 0 ? null : entitlement.remaining,
      unlimited: entitlement.quota === 0,
      daysLeft: entitlement.tier === "PREMIUM" ? daysLeft : 0,
      priceIdr: cfg.premiumPriceIdr,
      paymentsEnabled: Boolean(cfg.midtransServerKey && cfg.midtransClientKey),
    });
  });
}
