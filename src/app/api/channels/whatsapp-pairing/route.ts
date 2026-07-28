import { prisma } from "@/lib/db";
import { jsonOk, withApiGuard } from "@/lib/api";
import { emitToUser } from "@/lib/socket-server";

const PAIRING_COMMAND_PREFIX = "PAIR_QR:";
const QR_FRESH_MS = 75_000;
const RECONNECT_GRACE_MS = 15_000;

/** Requests a fresh Baileys pairing session from the dedicated worker. */
export async function POST(request: Request) {
  return withApiGuard(
    request,
    async (userId) => {
      const current = await prisma.whatsAppSession.findUnique({ where: { userId } });
      if (current?.isConnected) {
        return jsonOk({ status: "CONNECTED", session: current });
      }

      const qrIsFresh = Boolean(
        current?.lastQr && Date.now() - current.updatedAt.getTime() < QR_FRESH_MS,
      );
      if (qrIsFresh) {
        return jsonOk({ status: "QR_READY", session: current });
      }
      if (current && Date.now() - current.updatedAt.getTime() < RECONNECT_GRACE_MS) {
        return jsonOk({ status: "WAITING_FOR_WORKER", session: current });
      }

      const command = `${PAIRING_COMMAND_PREFIX}${Date.now()}`;
      const session = await prisma.whatsAppSession.upsert({
        where: { userId },
        update: {
          isConnected: false,
          lastQr: null,
          phoneNumber: null,
          sessionData: command,
        },
        create: {
          userId,
          isConnected: false,
          sessionData: command,
        },
      });
      emitToUser(userId, "whatsapp:session", session);
      return jsonOk({ status: "REQUESTED", session });
    },
    { rateLimitKey: "whatsapp-pairing", limit: 20 },
  );
}
