import { loadEnvConfig } from "@next/env";
import { prisma } from "../src/lib/db";

loadEnvConfig(process.cwd());

/**
 * Membuatkan baris UserSettings untuk akun yang belum punya.
 *
 * `ensureUserSettings()` sekarang dipanggil saat signup, tapi akun yang lahir
 * sebelum baris itu ada tidak pernah mendapat settings-nya. Itu bukan masalah
 * kosmetik: `tickHeartbeat()` mencari user lewat tabel UserSettings
 * (`where: { heartbeatEnabled: true }`), jadi akun tanpa baris itu tidak
 * terlihat sama sekali oleh penjadwal dan tidak akan pernah menerima laporan —
 * tanpa error, tanpa log.
 *
 * Aman dijalankan berkali-kali: createMany + skipDuplicates.
 *
 *   npx tsx scripts/backfill-user-settings.ts [--dry-run]
 */
async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const orphans = await prisma.user.findMany({
    where: { settings: { is: null } },
    select: { id: true, username: true },
  });

  if (orphans.length === 0) {
    console.log("Semua user sudah punya UserSettings — tidak ada yang perlu dikerjakan.");
    return;
  }

  console.log(`${orphans.length} user tanpa UserSettings:`);
  for (const user of orphans) console.log(`  - ${user.username ?? user.id}`);

  if (dryRun) {
    console.log("\n--dry-run: tidak ada yang ditulis.");
    return;
  }

  const created = await prisma.userSettings.createMany({
    data: orphans.map((user) => ({ userId: user.id })),
    skipDuplicates: true,
  });

  console.log(`\n${created.count} baris UserSettings dibuat dengan nilai default.`);
  console.log("Heartbeat akan mulai melihat akun-akun ini pada tick berikutnya.");
}

main()
  .catch((err) => {
    console.error("Backfill gagal:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
