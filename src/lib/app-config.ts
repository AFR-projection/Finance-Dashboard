import { prisma } from "@/lib/db";
import { FinanceEngine } from "@/finance-engine";

export type AppConfigView = {
  setupCompleted: boolean;
  ownerName: string | null;
  ownerUserId: string | null;
  hasTelegram: boolean;
  telegramOwnerChatId: string | null;
  /** Siap dipakai: setup selesai + channel owner Telegram aktif */
  isReady: boolean;
};

function computeReady(cfg: {
  setupCompleted: boolean;
  telegramBotToken: string | null;
  telegramOwnerChatId: string | null;
}) {
  if (!cfg.setupCompleted) return false;
  return Boolean(cfg.telegramBotToken && cfg.telegramOwnerChatId);
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
    telegramOwnerChatId: row.telegramOwnerChatId,
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
};

export async function bootstrapApp(input: BootstrapInput) {
  const tgOk = Boolean(input.telegramBotToken?.trim() && input.telegramOwnerChatId?.trim());
  if (!tgOk) {
    throw new Error("Telegram wajib: isi bot token dan chat ID owner.");
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

  await prisma.appConfig.update({
    where: { id: "singleton" },
    data: {
      ownerUserId: user.id,
      ownerName: input.ownerName,
      telegramBotToken: input.telegramBotToken?.trim() || null,
      telegramOwnerChatId: input.telegramOwnerChatId?.trim() || null,
      setupCompleted: true,
    },
  });

  // Auto-link owner channel ID
  if (input.telegramOwnerChatId) {
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

  return getAppConfig();
}

export async function updateOwnerBotConfig(input: {
  ownerName?: string;
  telegramBotToken?: string | null;
  telegramOwnerChatId?: string | null;
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

  if (!nextToken || !nextChat) {
    throw new Error("Telegram owner harus tetap aktif: token dan chat ID wajib ada.");
  }

  await prisma.appConfig.update({
    where: { id: "singleton" },
    data: {
      ownerName: input.ownerName?.trim() || cfg.ownerName,
      telegramBotToken: nextToken,
      telegramOwnerChatId: nextChat,
    },
  });

  return getAppConfig();
}

export type TelegramSendResult = {
  delivered: boolean;
  /** True when Telegram refused because the user never pressed Start. */
  needsStart?: boolean;
};

type SendOptions = {
  approveCode?: string;
  replyMarkup?: unknown;
  parseMode?: "Markdown" | "HTML";
};

function approveKeyboard(code: string) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Izinkan", callback_data: `access:approve:${code}` },
        { text: "⛔ Tolak", callback_data: `access:reject:${code}` },
      ],
    ],
  };
}

/**
 * One bot serves every account, so the token is platform-wide but the recipient
 * is not. A 403 means the chat never pressed Start — the caller must offer a
 * link to the bot rather than reporting a generic failure.
 */
export async function sendTelegramMessage(
  chatId: string,
  message: string,
  options: SendOptions = {},
): Promise<TelegramSendResult> {
  const cfg = await getAppConfigRaw();
  if (!cfg.telegramBotToken || !chatId) {
    return { delivered: false };
  }

  const reply_markup = options.approveCode
    ? approveKeyboard(options.approveCode)
    : options.replyMarkup;

  const response = await fetch(
    `https://api.telegram.org/bot${cfg.telegramBotToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        ...(reply_markup ? { reply_markup } : {}),
        ...(options.parseMode ? { parse_mode: options.parseMode } : {}),
      }),
    },
  );

  if (response.ok) return { delivered: true };
  return { delivered: false, needsStart: response.status === 403 };
}

/**
 * Telegram is the only owner channel, so a missing token means nobody was
 * reached. Callers must show the code on screen instead of assuming delivery.
 */
export async function notifyOwner(
  message: string,
  options: { approveCode?: string } = {},
): Promise<{ delivered: boolean }> {
  const cfg = await getAppConfigRaw();
  if (!cfg.telegramOwnerChatId) return { delivered: false };
  return sendTelegramMessage(cfg.telegramOwnerChatId, message, options);
}

/** Deep links need the @handle, and it is only discoverable from the token. */
export async function getBotUsername(): Promise<string | null> {
  const cfg = await getAppConfigRaw();
  if (!cfg.telegramBotToken) return null;

  const response = await fetch(`https://api.telegram.org/bot${cfg.telegramBotToken}/getMe`);
  if (!response.ok) return null;
  const json = (await response.json()) as { result?: { username?: string } };
  return json.result?.username ?? null;
}
