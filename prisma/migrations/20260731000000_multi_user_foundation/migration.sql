-- Multi-user foundation: roles, account status, and login identities.
--
-- Every new column is nullable or defaulted, so existing rows survive untouched.
-- The final backfill promotes the pre-existing single owner to ADMIN and adopts
-- the platform Telegram chat id as that admin's own identity.

CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

ALTER TABLE "users"
  ADD COLUMN "username" TEXT,
  ADD COLUMN "telegram_chat_id" TEXT,
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER',
  ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- Postgres treats NULLs as distinct, so these allow many rows without an
-- identity yet while still forbidding two accounts on one Telegram chat.
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE UNIQUE INDEX "users_telegram_chat_id_key" ON "users"("telegram_chat_id");

-- Promote the existing owner. Written as an UPDATE ... FROM so it is a no-op on
-- a fresh database where app_config has no owner yet.
UPDATE "users" AS u
SET
  "role" = 'ADMIN',
  "telegram_chat_id" = COALESCE(u."telegram_chat_id", c."telegram_owner_chat_id"),
  "username" = COALESCE(
    u."username",
    NULLIF(LOWER(REGEXP_REPLACE(COALESCE(c."owner_name", ''), '[^a-zA-Z0-9]', '', 'g')), ''),
    'admin'
  )
FROM "app_config" AS c
WHERE c."id" = 'singleton'
  AND c."owner_user_id" = u."id";
