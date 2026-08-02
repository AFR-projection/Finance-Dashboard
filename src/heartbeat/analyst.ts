/**
 * Turns a heartbeat snapshot into guidance worth interrupting the user for.
 *
 * One non-streaming completion, no tools attached: there is nothing to write, and
 * without tools an accidental mutation is impossible. The model may only use the
 * figures handed to it, and it may decide the day is not worth a notification.
 */

import pino from "pino";
import type { AiRuntimeConfig } from "@/ai/agent";
import { recordAiUsage } from "@/ai/usage";
import type { HeartbeatSnapshot } from "./signals";

const log = pino({ level: process.env.LOG_LEVEL || "info" });

export type HeartbeatAnalysis = {
  shouldSend: boolean;
  title: string;
  body: string;
  severity: "info" | "good" | "warning" | "critical";
  actions: string[];
};

const DAILY_BRIEF = `Tugasmu: brief pagi. Angkat maksimal 2 hal paling penting hari ini, lalu satu aksi konkret yang bisa dikerjakan hari ini.`;

const WEEKLY_BRIEF = `Tugasmu: rekap Senin. Ringkas pekan lalu (pemasukan, pengeluaran, apa yang berubah), lalu rencana pekan ini, lalu status goal. Tetap padat.`;

const MONTHLY_BRIEF = `Tugasmu: laporan tutup bulan. Ringkas bulan yang baru selesai — total masuk, total keluar, kategori terbesar, dan apakah membaik atau memburuk dibanding bulan sebelumnya. Tutup dengan satu fokus untuk bulan ini. File rekap transaksi dikirim terpisah sebagai lampiran, jadi jangan bilang kamu melampirkannya di teks.`;

const BRIEFS: Record<"daily" | "weekly" | "monthly", string> = {
  daily: DAILY_BRIEF,
  weekly: WEEKLY_BRIEF,
  monthly: MONTHLY_BRIEF,
};

function systemPrompt(cadence: "daily" | "weekly" | "monthly"): string {
  return `Kamu Ledgerly, chief of staff keuangan pribadi user. Kamu sedang menulis pesan proaktif — user tidak bertanya apa pun, jadi pesan ini harus benar-benar layak mengganggu mereka.

${BRIEFS[cadence]}

ATURAN ANGKA
- Hanya boleh memakai angka yang ada di data. Jangan menghitung ulang, jangan menaksir, jangan mengarang persentase.
- Format rupiah seperti Rp25.000. Sebut periode saat menyebut angka.
- Proyeksi adalah estimasi — sebut sebagai proyeksi, bukan fakta.

ATURAN KIRIM
- shouldSend=false kalau tidak ada yang benar-benar penting: tidak ada sinyal berarti, atau isinya cuma mengulang recentInsightTitles.
- Khusus cadence "monthly": shouldSend selalu true. Laporan tutup bulan adalah kiriman rutin yang memang diminta user, bukan gangguan.
- Jangan kirim peringatan yang sama dua hari berturut-turut dengan kalimat yang sama.
- Kalau kondisi keuangannya sehat, sesekali boleh kirim kabar baik — tapi jangan tiap hari.

GAYA
- Bahasa Indonesia, tenang, hangat, tanpa basa-basi. Tanpa sapaan template, tanpa "Sebagai AI", tanpa emoji berlebihan (maksimal satu).
- body maksimal 600 karakter, paragraf pendek atau bullet sederhana. Tanpa Markdown heading, tanpa tabel.
- title maksimal 60 karakter, spesifik, bukan "Update Keuangan".
- actions: 0–3 kalimat aksi, masing-masing konkret dan terukur.

Jawab HANYA satu objek JSON, tanpa penjelasan dan tanpa code fence:
{"shouldSend":boolean,"title":string,"body":string,"severity":"info"|"good"|"warning"|"critical","actions":string[]}`;
}

function parseAnalysis(raw: string): HeartbeatAnalysis | null {
  // Models still wrap JSON in prose or fences despite the instruction, so take
  // the outermost object rather than trusting the whole string.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const obj = parsed as Record<string, unknown>;
  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const body = typeof obj.body === "string" ? obj.body.trim() : "";
  if (!title || !body) return null;

  const severity = ["info", "good", "warning", "critical"].includes(String(obj.severity))
    ? (obj.severity as HeartbeatAnalysis["severity"])
    : "info";

  return {
    shouldSend: obj.shouldSend === true,
    title: title.slice(0, 80),
    body: body.slice(0, 900),
    severity,
    actions: Array.isArray(obj.actions)
      ? obj.actions.filter((a): a is string => typeof a === "string" && a.trim().length > 0).slice(0, 3)
      : [],
  };
}

/**
 * Returns null when the provider or the response is unusable. The caller skips
 * the cycle instead of pushing a bland template — a heartbeat the user learns to
 * ignore is worse than no heartbeat.
 */
export async function analyzeHeartbeat(params: {
  snapshot: HeartbeatSnapshot;
  config: AiRuntimeConfig;
  /** Set to attribute token spend; heartbeat never consumes the user's quota. */
  userId?: string;
}): Promise<HeartbeatAnalysis | null> {
  const { snapshot, config } = params;
  if (!config.apiKey) {
    log.warn(
      "Heartbeat dilewati: API key AI tidak tersedia. Cek panel admin /ai — kalau key sudah diisi, kemungkinan ENCRYPTION_KEY berubah sehingga key lama tidak bisa dibaca.",
    );
    return null;
  }

  const models = [config.model, ...(config.fallbackModels ?? []).filter((m) => m !== config.model)];

  for (const model of models) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
          "X-Title": "Ledgerly Heartbeat",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt(snapshot.cadence) },
            {
              role: "user",
              content: `Data keuangan user (satu-satunya sumber angka):\n${JSON.stringify(snapshot, null, 1)}`,
            },
          ],
          temperature: 0.4,
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      if (params.userId && json.usage) {
        await recordAiUsage({
          userId: params.userId,
          source: "HEARTBEAT",
          model,
          usage: {
            promptTokens: json.usage.prompt_tokens ?? 0,
            outputTokens: json.usage.completion_tokens ?? 0,
          },
        });
      }

      const content = json.choices?.[0]?.message?.content ?? "";
      const analysis = parseAnalysis(content);
      if (analysis) return analysis;

      throw new Error("Respons bukan JSON analisis yang valid");
    } catch (err) {
      log.warn({ err, model }, "Heartbeat: model gagal, mencoba fallback");
    }
  }

  log.error("Heartbeat dilewati: semua model gagal");
  return null;
}
