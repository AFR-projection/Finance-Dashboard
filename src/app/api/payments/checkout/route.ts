import { NextResponse } from "next/server";
import { getAppConfigRaw } from "@/lib/app-config";
import { jsonOk, withApiGuard } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getMidtransKeys, newOrderId, snapBaseUrl } from "@/lib/midtrans";
import { SITE_URL } from "@/lib/site";

/** Creates a Snap transaction and returns the token the browser needs. */
export async function POST(request: Request) {
  return withApiGuard(
    request,
    async (userId) => {
      const keys = await getMidtransKeys();
      if (!keys) {
        return NextResponse.json(
          {
            ok: false,
            error: { code: "UNAVAILABLE", message: "Pembayaran belum dikonfigurasi admin." },
          },
          { status: 503 },
        );
      }

      const cfg = await getAppConfigRaw();
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, name: true },
      });

      const orderId = newOrderId(userId);
      const grossAmount = cfg.premiumPriceIdr;

      // Recorded before calling Midtrans so the webhook always finds a row to
      // match, even if the user pays before this request finishes.
      await prisma.payment.create({
        data: { userId, orderId, grossAmount, status: "pending" },
      });

      const res = await fetch(`${snapBaseUrl(keys.isProduction)}/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`${keys.serverKey}:`).toString("base64")}`,
        },
        body: JSON.stringify({
          transaction_details: { order_id: orderId, gross_amount: grossAmount },
          item_details: [
            {
              // Harga dan masa aktif keduanya diatur dari panel master admin,
              // jadi label yang dilihat pembeli harus ikut angka itu.
              id: `premium-${cfg.premiumDurationDays}`,
              name: `Ledgerly Premium ${cfg.premiumDurationDays} hari`,
              price: grossAmount,
              quantity: 1,
            },
          ],
          customer_details: { first_name: user?.name || user?.username || "Pengguna" },
          callbacks: { finish: `${SITE_URL}/dashboard` },
        }),
      });

      if (!res.ok) {
        await prisma.payment.update({ where: { orderId }, data: { status: "failed" } });
        console.error("[midtrans] snap gagal", await res.text());
        return NextResponse.json(
          { ok: false, error: { code: "SNAP_FAILED", message: "Gagal membuat pembayaran." } },
          { status: 502 },
        );
      }

      const json = (await res.json()) as { token?: string; redirect_url?: string };
      return jsonOk({
        orderId,
        token: json.token,
        redirectUrl: json.redirect_url,
        clientKey: keys.clientKey,
        isProduction: keys.isProduction,
        grossAmount,
      });
    },
    { rateLimitKey: "checkout", limit: 10 },
  );
}
