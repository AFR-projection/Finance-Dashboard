import { prisma } from "@/lib/db";

/** Best-effort push of login confirmation codes to linked Telegram chats */
export async function notifyLinkedChannels(userId: string, message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const links = await prisma.channelLink.findMany({
    where: { userId, isActive: true },
  });

  await Promise.allSettled(
    links.map(async (link) => {
      if (link.channel === "TELEGRAM" && token) {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: link.externalId,
            text: message,
          }),
        });
      }
      // WhatsApp: user must be messaged by Baileys worker; store pending in Redis pub optional.
      // For now Telegram push is primary; WhatsApp users use the code shown on screen.
    }),
  );

  return links.map((l) => l.channel);
}
