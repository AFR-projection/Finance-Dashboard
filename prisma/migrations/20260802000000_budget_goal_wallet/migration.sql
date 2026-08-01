-- Budget dan Goal wajib menempel ke satu rekening.
--
-- Tanpa ini, "Budget makan 500rb" tidak punya mata uang: pengeluaran bisa
-- terjadi di rekening rupiah maupun dolar dan angkanya jadi tak berarti.
--
-- Baris lama dihapus alih-alih ditebak rekeningnya. Menebak akan menghasilkan
-- budget yang terlihat benar tapi mengukur rekening yang salah — lebih
-- berbahaya daripada meminta pengguna membuatnya ulang secara sadar.

DELETE FROM "budgets";
DELETE FROM "financial_goals";

ALTER TABLE "budgets" ADD COLUMN "wallet_id" TEXT NOT NULL;
ALTER TABLE "financial_goals" ADD COLUMN "wallet_id" TEXT NOT NULL;

ALTER TABLE "budgets" ADD CONSTRAINT "budgets_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financial_goals" ADD CONSTRAINT "financial_goals_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Satu kategori boleh punya budget terpisah di tiap rekening: "makan 500rb dari
-- MANDIRI" dan "makan $50 dari ABA" adalah dua anggaran yang sah.
DROP INDEX IF EXISTS "budgets_user_id_category_id_month_year_key";
CREATE UNIQUE INDEX "budgets_user_id_category_id_wallet_id_month_year_key"
  ON "budgets"("user_id", "category_id", "wallet_id", "month", "year");
