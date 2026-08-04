import { loadEnvConfig } from "@next/env";
import { prisma } from "../src/lib/db";
import { readHeartbeatAlive } from "../src/heartbeat/liveness";
import { getAppConfigRaw } from "../src/lib/app-config";
import { resolveAiConfig } from "../src/ai/resolve-config";

loadEnvConfig(process.cwd());

/**
 * Menjawab satu pertanyaan: kenapa heartbeat tidak mengirim apa-apa?
 *
 * Setiap prasyarat diperiksa terpisah karena kegagalannya dulu tidak bisa
 * dibedakan dari luar — worker mati, tidak ada user Premium, API key tidak bisa
 * didekripsi, dan analis memutuskan tidak ada yang layak dikirim semuanya
 * berakhir sama: senyap.
 *
 *   npx tsx scripts/heartbeat-doctor.ts
 */

const ok = (s: string) => `  ✓ ${s}`;
const bad = (s: string) => `  ✗ ${s}`;
const warn = (s: string) => `  ! ${s}`;

async function main() {
  const problems: string[] = [];

  console.log("\n── Worker ──");
  const liveness = await readHeartbeatAlive();
  if (!liveness.known) {
    console.log(warn("Redis tidak aktif — liveness worker tidak bisa dipastikan dari sini."));
  } else if (liveness.alive) {
    console.log(ok(`Worker hidup, tick terakhir ${liveness.lastTickAt?.toLocaleString("id-ID")}`));
  } else {
    console.log(bad("Worker TIDAK mengirim tick. Cek: docker compose ps heartbeat-worker"));
    problems.push("worker heartbeat tidak jalan");
  }

  console.log("\n── Siapa yang dijadwalkan ──");
  const users = await prisma.user.count();
  const settings = await prisma.userSettings.count();
  const enabled = await prisma.userSettings.count({ where: { heartbeatEnabled: true } });
  console.log(`  ${users} user, ${settings} punya UserSettings, ${enabled} mengaktifkan heartbeat`);
  if (settings < users) {
    console.log(
      bad(
        `${users - settings} user TIDAK punya baris UserSettings — penjadwal tidak bisa melihat mereka.`,
      ),
    );
    console.log("    Perbaiki: npx tsx scripts/backfill-user-settings.ts");
    problems.push("ada user tanpa UserSettings");
  }
  if (enabled === 0) problems.push("tidak ada user dengan heartbeatEnabled");

  console.log("\n── Hak akses ──");
  const cfg = await getAppConfigRaw();
  const premium = await prisma.subscription.count({
    where: { tier: "PREMIUM", currentPeriodEnd: { gt: new Date() } },
  });
  console.log(`  ${premium} akun Premium aktif, heartbeatForFree = ${cfg.heartbeatForFree}`);
  if (premium === 0 && !cfg.heartbeatForFree) {
    console.log(
      bad("Tidak ada akun Premium DAN heartbeatForFree mati — semua user akan di-skip diam-diam."),
    );
    console.log("    Perbaiki: nyalakan 'Heartbeat untuk FREE' di panel admin /plans");
    problems.push("tidak ada yang berhak menerima heartbeat");
  }

  console.log("\n── Kredensial AI ──");
  const ai = await resolveAiConfig();
  if (!ai.apiKey) {
    console.log(bad("API key OpenRouter tidak terbaca."));
    console.log("    Kalau key sudah diisi di /ai, kemungkinan ENCRYPTION_KEY berubah.");
    problems.push("API key AI tidak tersedia");
  } else {
    console.log(ok(`Key terbaca, model utama ${ai.model}`));
    if (ai.fallbackModels?.length) console.log(`    fallback: ${ai.fallbackModels.join(", ")}`);
  }

  console.log("\n── Riwayat siklus ──");
  const byStatus = await prisma.heartbeatRun.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  if (byStatus.length === 0) {
    console.log(warn("Belum ada satu pun siklus tercatat."));
  } else {
    for (const row of byStatus) console.log(`  ${row.status.padEnd(8)} ${row._count._all}`);
  }

  const recent = await prisma.heartbeatRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 5,
    select: { periodKey: true, status: true, reason: true, startedAt: true, durationMs: true },
  });
  if (recent.length > 0) {
    console.log("\n  5 terakhir:");
    for (const r of recent) {
      const when = r.startedAt.toLocaleString("id-ID");
      const dur = r.durationMs ? ` ${r.durationMs}ms` : "";
      console.log(`    ${when}  ${r.periodKey}  ${r.status}${r.reason ? ` (${r.reason})` : ""}${dur}`);
    }
  }

  console.log(
    problems.length === 0
      ? "\n✓ Tidak ada penghalang terdeteksi.\n"
      : `\n✗ ${problems.length} penghalang: ${problems.join("; ")}\n`,
  );
}

main()
  .catch((err) => {
    console.error("Diagnosa gagal:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
