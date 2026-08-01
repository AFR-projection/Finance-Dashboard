import { loadEnvConfig } from "@next/env";
import bcrypt from "bcryptjs";
import { createInterface } from "readline/promises";
import { prisma } from "../src/lib/db";

loadEnvConfig(process.cwd());

/**
 * Sets an admin's panel password. There is deliberately no UI for this: the
 * password is the first factor for a panel that can read every account, so it
 * is set from the box that owns the database, not over the network.
 *
 *   npx tsx scripts/set-admin-password.ts <username>
 */
async function main() {
  const username = process.argv[2]?.trim().toLowerCase();
  if (!username) {
    console.error("Pakai: npx tsx scripts/set-admin-password.ts <username>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, role: true, telegramChatId: true },
  });

  if (!user) {
    console.error(`Tidak ada user dengan username "${username}".`);
    process.exit(1);
  }
  if (user.role !== "ADMIN") {
    console.error(`User "${username}" bukan ADMIN. Panel hanya menerima role ADMIN.`);
    process.exit(1);
  }
  if (!user.telegramChatId) {
    console.error(
      `User "${username}" belum punya telegramChatId. Login admin butuh konfirmasi Telegram.`,
    );
    process.exit(1);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const password = await rl.question("Password baru (min 12 karakter): ");
  const confirm = await rl.question("Ulangi password: ");
  rl.close();

  if (password.length < 12) {
    console.error("Password minimal 12 karakter.");
    process.exit(1);
  }
  if (password !== confirm) {
    console.error("Password tidak cocok.");
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 12) },
  });

  console.log(`\nPassword admin untuk @${username} tersimpan.`);
  console.log("Login di admin.<domain>/login — lalu setujui lewat Telegram.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
