-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('OPENROUTER');

-- CreateEnum
CREATE TYPE "ShareVisibility" AS ENUM ('PRIVATE', 'PUBLIC', 'SELECTED');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('TELEGRAM', 'WEB');

-- CreateEnum
CREATE TYPE "AccessChallengeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CONSUMED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ai_provider" "AiProvider" NOT NULL DEFAULT 'OPENROUTER',
    "ai_model" TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
    "encrypted_api_key" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "locale" TEXT NOT NULL DEFAULT 'id-ID',
    "monthly_income_hint" DECIMAL(18,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'circle',
    "color" TEXT NOT NULL DEFAULT '#0F766E',
    "type" "TransactionType" NOT NULL DEFAULT 'EXPENSE',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "color" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "category_id" TEXT,
    "wallet_id" TEXT,
    "sub_category" TEXT,
    "description" TEXT NOT NULL,
    "payment_method" TEXT,
    "transaction_date" DATE NOT NULL,
    "channel" "ChannelType" NOT NULL DEFAULT 'WEB',
    "raw_input" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "monthly_limit" DECIMAL(18,2) NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_goals" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "goal_name" TEXT NOT NULL,
    "target_amount" DECIMAL(18,2) NOT NULL,
    "current_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "deadline" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_memories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_insights" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "period_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "visibility" "ShareVisibility" NOT NULL DEFAULT 'PRIVATE',
    "show_balance" BOOLEAN NOT NULL DEFAULT false,
    "show_income" BOOLEAN NOT NULL DEFAULT true,
    "show_expense" BOOLEAN NOT NULL DEFAULT true,
    "show_charts" BOOLEAN NOT NULL DEFAULT true,
    "show_goals" BOOLEAN NOT NULL DEFAULT false,
    "display_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "share_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_links" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "channel" "ChannelType" NOT NULL,
    "external_id" TEXT NOT NULL,
    "display_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trusted_devices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "fingerprint_id" TEXT NOT NULL,
    "user_agent" TEXT,
    "last_ip" TEXT,
    "last_country" TEXT,
    "last_city" TEXT,
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trusted_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_challenges" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "fingerprint_id" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip" TEXT,
    "country" TEXT,
    "city" TEXT,
    "status" "AccessChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "approved_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "fingerprint_id" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip" TEXT,
    "country" TEXT,
    "city" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "channel" "ChannelType" NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "payment_method" TEXT,
    "transaction_date" TIMESTAMP(3) NOT NULL,
    "raw_input" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "owner_user_id" TEXT,
    "owner_name" TEXT,
    "telegram_bot_token" TEXT,
    "telegram_owner_chat_id" TEXT,
    "setup_completed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_user_id_key" ON "user_settings"("user_id");

-- CreateIndex
CREATE INDEX "categories_user_id_idx" ON "categories"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_user_id_name_type_key" ON "categories"("user_id", "name", "type");

-- CreateIndex
CREATE INDEX "wallets_user_id_idx" ON "wallets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_name_key" ON "wallets"("user_id", "name");

-- CreateIndex
CREATE INDEX "transactions_user_id_transaction_date_idx" ON "transactions"("user_id", "transaction_date");

-- CreateIndex
CREATE INDEX "transactions_user_id_type_idx" ON "transactions"("user_id", "type");

-- CreateIndex
CREATE INDEX "transactions_user_id_category_id_idx" ON "transactions"("user_id", "category_id");

-- CreateIndex
CREATE INDEX "transactions_user_id_wallet_id_idx" ON "transactions"("user_id", "wallet_id");

-- CreateIndex
CREATE INDEX "budgets_user_id_year_month_idx" ON "budgets"("user_id", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_user_id_category_id_month_year_key" ON "budgets"("user_id", "category_id", "month", "year");

-- CreateIndex
CREATE INDEX "financial_goals_user_id_idx" ON "financial_goals"("user_id");

-- CreateIndex
CREATE INDEX "ai_memories_user_id_idx" ON "ai_memories"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_memories_user_id_key_key" ON "ai_memories"("user_id", "key");

-- CreateIndex
CREATE INDEX "ai_insights_user_id_period_key_idx" ON "ai_insights"("user_id", "period_key");

-- CreateIndex
CREATE UNIQUE INDEX "share_profiles_user_id_key" ON "share_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "share_profiles_token_key" ON "share_profiles"("token");

-- CreateIndex
CREATE INDEX "channel_links_user_id_idx" ON "channel_links"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "channel_links_channel_external_id_key" ON "channel_links"("channel", "external_id");

-- CreateIndex
CREATE INDEX "trusted_devices_user_id_idx" ON "trusted_devices"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "trusted_devices_user_id_fingerprint_id_key" ON "trusted_devices"("user_id", "fingerprint_id");

-- CreateIndex
CREATE UNIQUE INDEX "access_challenges_session_id_key" ON "access_challenges"("session_id");

-- CreateIndex
CREATE INDEX "access_challenges_code_hash_idx" ON "access_challenges"("code_hash");

-- CreateIndex
CREATE INDEX "access_challenges_expires_at_idx" ON "access_challenges"("expires_at");

-- CreateIndex
CREATE INDEX "access_sessions_user_id_idx" ON "access_sessions"("user_id");

-- CreateIndex
CREATE INDEX "access_sessions_expires_at_idx" ON "access_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "pending_transactions_user_id_idx" ON "pending_transactions"("user_id");

-- CreateIndex
CREATE INDEX "pending_transactions_expires_at_idx" ON "pending_transactions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "app_config_owner_user_id_key" ON "app_config"("owner_user_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_goals" ADD CONSTRAINT "financial_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_profiles" ADD CONSTRAINT "share_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_links" ADD CONSTRAINT "channel_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_sessions" ADD CONSTRAINT "access_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_transactions" ADD CONSTRAINT "pending_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
