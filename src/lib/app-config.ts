import { prisma } from "@/lib/db";
import { FinanceEngine } from "@/finance-engine";

export type AppConfigView = {
  setupCompleted: boolean;
  ownerName: string | null;
  ownerUserId: string | null;
  hasTelegram: boolean;
  hasWhatsApp: boolean;
  telegramOwnerChatId: string | null;
  whatsappOwnerPhone: string | null;
  /** Siap dipakai: setup selesai + minimal 1 channel owner */
  isReady: boolean;
};

function computeReady(cfg: {
  setupCompleted: boolean;
  telegramBotToken: string | null;
  telegramOwnerChatId: string | null;
  whatsappOwnerPhone: string | null;
}) {
  if (!cfg.setupCompleted) return false;
  const tg = Boolean(cfg.telegramBotToken && cfg.telegramOwnerChatId);
  const wa = Boolean(cfg.whatsappOwnerPhone);
  return tg || wa;
}

export async function getAppConfig(): Promise<AppConfigView> {
  const row = await prisma.appConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  return {
    setupCompleted: row.setupCompleted,
    ownerName: row.ownerName,
    ownerUserId: row.ownerUserId,
    hasTelegram: Boolean(row.telegramBotToken && row.telegramOwnerChatId),
    hasWhatsApp: Boolean(row.whatsappOwnerPhone),
    telegramOwnerChatId: row.telegramOwnerChatId,
    whatsappOwnerPhone: row.whatsappOwnerPhone,
    isReady: computeReady(row),
  };
}

export async function getAppConfigRaw() {
  return prisma.appConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function requireOwnerUserId(): Promise<string> {
  const cfg = await getAppConfigRaw();
  if (!cfg.ownerUserId || !cfg.setupCompleted) {
    throw new Error("SETUP_REQUIRED");
  }
  return cfg.ownerUserId;
}

export type BootstrapInput = {
  ownerName: string;
  telegramBotToken?: string;
  telegramOwnerChatId?: string;
  whatsappOwnerPhone?: string;
};

export async function bootstrapApp(input: BootstrapInput) {
  const tgOk = Boolean(input.telegramBotToken?.trim() && input.telegramOwnerChatId?.trim());
  const waOk = Boolean(input.whatsappOwnerPhone?.trim());
  if (!tgOk && !waOk) {
    throw new Error("Minimal satu channel: Telegram (token + chat ID) atau WhatsApp (nomor owner).");
  }

  const existing = await getAppConfigRaw();
  if (existing.setupCompleted && existing.ownerUserId) {
    throw new Error("Setup sudah selesai. Ubah lewat Settings.");
  }

  const email = "owner@ledgerly.local";
  const user = await prisma.user.upsert({
    where: { email },
    update: { name: input.ownerName },
    create: {
      email,
      name: input.ownerName,
    },
  });

  await FinanceEngine.ensureUserSettings(user.id);
  await FinanceEngine.ensureDefaultCategories(user.id);

  const phone = input.whatsappOwnerPhone?.replace(/\D/g, "") || null;

  await prisma.appConfig.update({
    where: { id: "singleton" },
    data: {
      ownerUserId: user.id,
      ownerName: input.ownerName,
      telegramBotToken: input.telegramBotToken?.trim() || null,
      telegramOwnerChatId: input.telegramOwnerChatId?.trim() || null,
      whatsappOwnerPhone: phone,
      setupCompleted: true,
    },
  });

  // Auto-link owner channel IDs
  if (tgOk && input.telegramOwnerChatId) {
    await prisma.channelLink.upsert({
      where: {
        channel_externalId: {
          channel: "TELEGRAM",
          externalId: input.telegramOwnerChatId.trim(),
        },
      },
      update: { userId: user.id, isActive: true, displayName: "Owner" },
      create: {
        userId: user.id,
        channel: "TELEGRAM",
        externalId: input.telegramOwnerChatId.trim(),
        displayName: "Owner",
        isActive: true,
      },
    });
  }

  if (waOk && phone) {
    await prisma.channelLink.upsert({
      where: {
        channel_externalId: { channel: "WHATSAPP", externalId: phone },
      },
      update: { userId: user.id, isActive: true, displayName: "Owner" },
      create: {
        userId: user.id,
        channel: "WHATSAPP",
        externalId: phone,
        displayName: "Owner",
        isActive: true,
      },
    });
  }

  return getAppConfig();
}

export async function updateOwnerBotConfig(input: {
  ownerName?: string;
  telegramBotToken?: string | null;
  telegramOwnerChatId?: string | null;
  whatsappOwnerPhone?: string | null;
  clearTelegramToken?: boolean;
}) {
  const cfg = await getAppConfigRaw();
  if (!cfg.setupCompleted || !cfg.ownerUserId) {
    throw new Error("SETUP_REQUIRED");
  }

  const nextToken =
    input.clearTelegramToken
      ? null
      : input.telegramBotToken !== undefined
        ? input.telegramBotToken?.trim() || cfg.telegramBotToken
        : cfg.telegramBotToken;

  const nextChat =
    input.telegramOwnerChatId !== undefined
      ? input.telegramOwnerChatId?.trim() || null
      : cfg.telegramOwnerChatId;

  const nextPhone =
    input.whatsappOwnerPhone !== undefined
      ? input.whatsappOwnerPhone?.replace(/\D/g, "") || null
      : cfg.whatsappOwnerPhone;

  const tgOk = Boolean(nextToken && nextChat);
  const waOk = Boolean(nextPhone);
  if (!tgOk && !waOk) {
    throw new Error("Minimal satu channel owner harus aktif.");
  }

  await prisma.appConfig.update({
    where: { id: "singleton" },
    data: {
      ownerName: input.ownerName?.trim() || cfg.ownerName,
      telegramBotToken: nextToken,
      telegramOwnerChatId: nextChat,
      whatsappOwnerPhone: nextPhone,
    },
  });

  return getAppConfig();
}

export async function notifyOwner(
  message: string,
  options: { approveCode?: string } = {},
) {
  const cfg = await getAppConfigRaw();
  if (cfg.telegramBotToken && cfg.telegramOwnerChatId) {
    const reply_markup = options.approveCode
      ? {
          inline_keyboard: [
            [
              { text: "✅ Izinkan", callback_data: `access:approve:${options.approveCode}` },
              { text: "⛔ Tolak", callback_data: `access:reject:${options.approveCode}` },
            ],
          ],
        }
      : undefined;

    await fetch(`https://api.telegram.org/bot${cfg.telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: cfg.telegramOwnerChatId,
        text: message,
        ...(reply_markup ? { reply_markup } : {}),
      }),
    });
    return { channel: "TELEGRAM" as const };
  }
  // WhatsApp: owner will see code on screen / reply approve on WA bot
  return { channel: "WHATSAPP" as const };
}
