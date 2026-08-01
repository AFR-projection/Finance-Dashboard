-- Fase 4: langganan, kuota token, dan pembayaran.
--
-- Semua kolom baru punya default, jadi baris lama tetap sah. Admin lama
-- dipromosikan ke PREMIUM permanen di akhir supaya tidak kehilangan akses AI
-- saat paywall menyala.

CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PREMIUM');
CREATE TYPE "UsageSource" AS ENUM ('CHAT', 'HEARTBEAT');

ALTER TABLE "users" ADD COLUMN "token_quota_override" INTEGER;

CREATE TABLE "subscriptions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "tier" "PlanTier" NOT NULL DEFAULT 'FREE',
  "current_period_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "current_period_end" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");
CREATE INDEX "subscriptions_current_period_end_idx" ON "subscriptions"("current_period_end");
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ai_usage_monthly" (
  "user_id" TEXT NOT NULL,
  "period_key" TEXT NOT NULL,
  "source" "UsageSource" NOT NULL,
  "tokens" INTEGER NOT NULL DEFAULT 0,
  "requests" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_usage_monthly_pkey" PRIMARY KEY ("user_id", "period_key", "source")
);
ALTER TABLE "ai_usage_monthly" ADD CONSTRAINT "ai_usage_monthly_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ai_usage_log" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "source" "UsageSource" NOT NULL,
  "model" TEXT NOT NULL,
  "prompt_tokens" INTEGER NOT NULL,
  "output_tokens" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_usage_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_usage_log_user_id_created_at_idx" ON "ai_usage_log"("user_id", "created_at");
ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "payments" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "gross_amount" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "paid_at" TIMESTAMP(3),
  "raw" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payments_order_id_key" ON "payments"("order_id");
CREATE INDEX "payments_user_id_created_at_idx" ON "payments"("user_id", "created_at");
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_config"
  ADD COLUMN "openrouter_api_key" TEXT,
  ADD COLUMN "ai_model" TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
  ADD COLUMN "ai_fallback_models" TEXT,
  ADD COLUMN "free_token_quota" INTEGER NOT NULL DEFAULT 60000,
  ADD COLUMN "premium_token_quota" INTEGER NOT NULL DEFAULT 1500000,
  ADD COLUMN "premium_price_idr" INTEGER NOT NULL DEFAULT 20000,
  ADD COLUMN "heartbeat_for_free" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "midtrans_server_key" TEXT,
  ADD COLUMN "midtrans_client_key" TEXT,
  ADD COLUMN "midtrans_is_production" BOOLEAN NOT NULL DEFAULT false;

-- Admin yang sudah ada memakai platform ini sebelum paywall lahir; mencabut
-- akses AI mereka saat migrasi akan terasa seperti kerusakan, bukan kebijakan.
INSERT INTO "subscriptions" ("id", "user_id", "tier", "current_period_end", "updated_at")
SELECT
  'sub_' || substr(md5(random()::text || "id"), 1, 20),
  "id",
  'PREMIUM',
  NOW() + INTERVAL '100 years',
  NOW()
FROM "users"
WHERE "role" = 'ADMIN'
ON CONFLICT DO NOTHING;
