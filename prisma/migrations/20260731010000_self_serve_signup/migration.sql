-- Self-serve signup: challenges now carry who they are for and why.
--
-- `purpose` defaults to ACCESS so every in-flight legacy challenge keeps its
-- old meaning. The rest are nullable: a REGISTER challenge has no userId until
-- Telegram answers, and a LOGIN challenge has no username to reserve.

CREATE TYPE "ChallengePurpose" AS ENUM ('ACCESS', 'REGISTER', 'LOGIN');

ALTER TABLE "access_challenges"
  ADD COLUMN "purpose" "ChallengePurpose" NOT NULL DEFAULT 'ACCESS',
  ADD COLUMN "user_id" TEXT,
  ADD COLUMN "username" TEXT,
  ADD COLUMN "start_token" TEXT;

-- The deep link is the only proof a /start carries, so two live challenges must
-- never share a token. NULLs stay distinct in Postgres, so ACCESS and LOGIN
-- challenges (which have none) are unaffected.
CREATE UNIQUE INDEX "access_challenges_start_token_key"
  ON "access_challenges"("start_token");
