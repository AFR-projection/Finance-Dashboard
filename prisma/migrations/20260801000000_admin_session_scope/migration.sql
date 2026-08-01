-- Admin panel isolation.
--
-- Sessions now carry the surface they were minted for. Existing rows default to
-- USER, which is correct: every session issued before this migration came from
-- the dashboard login flow, and none of them should silently gain admin reach.

CREATE TYPE "SessionScope" AS ENUM ('USER', 'ADMIN');

ALTER TABLE "access_sessions"
  ADD COLUMN "scope" "SessionScope" NOT NULL DEFAULT 'USER';

-- The admin panel's second factor is a challenge like any other, but it must be
-- distinguishable so a LOGIN challenge cannot be redeemed for an admin session.
ALTER TYPE "ChallengePurpose" ADD VALUE 'ADMIN_LOGIN';
