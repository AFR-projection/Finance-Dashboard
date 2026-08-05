/**
 * Satu-satunya pintu keluar ke OpenRouter.
 *
 * Sebelum file ini ada, jalur chat dan jalur heartbeat masing-masing memanggil
 * `fetch` telanjang. Dua masalah yang sama-sama tidak terlihat sampai penyedia
 * bermasalah:
 *
 * 1. `fetch` Node/undici TIDAK punya batas waktu badan respons. Panggilan yang
 *    menggantung menggantung selamanya. Di jalur heartbeat itu fatal: tick-nya
 *    mengerjakan user satu per satu, jadi satu panggilan macet menahan SEMUA
 *    user berikutnya sekaligus menghentikan `markHeartbeatAlive()` — panel
 *    /system lalu melaporkan worker mati padahal ia cuma sedang menunggu.
 * 2. Tidak ada percobaan ulang. Satu 429 atau 502 sesaat langsung dianggap
 *    "model ini gagal", lalu rantai fallback pindah ke model yang lebih lemah —
 *    padahal permintaan yang sama persis kemungkinan besar berhasil satu detik
 *    kemudian.
 *
 * Yang diulang hanya kegagalan yang memang sementara. 400/401/402/403 berarti
 * permintaan atau akunnya yang salah; mengulanginya cuma menunda pesan error
 * yang benar dan, untuk 402, tetap tidak menambah saldo.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Status yang berarti "coba lagi nanti", bukan "permintaanmu salah".
 *
 * 409 dan 425 ikut karena sebagian gateway memakainya untuk antrean yang belum
 * siap. 501 dan 505 sengaja tidak masuk: keduanya permanen.
 */
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

/**
 * Batas atas jeda antar percobaan.
 *
 * `Retry-After` dari penyedia kadang berisi ratusan detik. Menurutinya berarti
 * satu tick heartbeat berhenti lima menit — lebih baik menyerah dan mencoba
 * model berikutnya, karena periode yang gagal sekarang dijadwalkan ulang.
 */
const MAX_RETRY_DELAY_MS = 20_000;
const BASE_RETRY_DELAY_MS = 500;

export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_RETRIES = 2;

export type OpenRouterResult =
  | { ok: true; json: Record<string, unknown>; status: number; attempts: number }
  | {
      ok: false;
      /** Pesan siap tampil: sudah memuat status dan potongan badan error. */
      error: string;
      status?: number;
      /** Benar kalau permintaan identik masih layak diulang di lapisan atas. */
      retryable: boolean;
      attempts: number;
    };

/**
 * Menunggu backoff sungguhan menambah detik ke setiap test yang menguji retry.
 * Test menggantinya dengan no-op lewat `src/test-setup.ts`; produksi tidak
 * pernah menyentuh fungsi ini.
 */
let sleeper = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function setRetrySleeper(fn: (ms: number) => Promise<void>): void {
  sleeper = fn;
}

function parseRetryAfter(headers: Headers | undefined): number | null {
  // Stub Response di test tidak selalu punya `headers`.
  const raw = headers?.get?.("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
  }
  const at = Date.parse(raw);
  if (Number.isNaN(at)) return null;
  return Math.min(Math.max(0, at - Date.now()), MAX_RETRY_DELAY_MS);
}

/**
 * Jitter penuh, bukan backoff murni: kalau penyedia sempat down, semua worker
 * dan semua user jatuh tempo akan mengantre lalu mencoba ulang pada milidetik
 * yang sama dan menabrak penyedia yang baru bangun.
 */
function backoffFor(attempt: number): number {
  const ceiling = Math.min(BASE_RETRY_DELAY_MS * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
  return Math.round(ceiling / 2 + Math.random() * (ceiling / 2));
}

type Attempt =
  | { ok: true; json: Record<string, unknown>; status: number }
  | { ok: false; error: string; status?: number; retryable: boolean; retryAfterMs?: number };

export async function callOpenRouter(params: {
  apiKey: string;
  /** Masuk ke header X-Title, yang muncul di dashboard OpenRouter. */
  title: string;
  body: Record<string, unknown>;
  timeoutMs?: number;
  maxRetries?: number;
  /**
   * Epoch ms. Batas keras untuk seluruh rangkaian percobaan: timeout tiap
   * panggilan dipendekkan agar muat, dan retry berhenti begitu terlewati.
   */
  deadlineAt?: number;
}): Promise<OpenRouterResult> {
  const timeoutMs = Math.max(1_000, params.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
  const maxRetries = Math.max(0, Math.round(params.maxRetries ?? DEFAULT_MAX_RETRIES));

  const once = async (perCallMs: number): Promise<Attempt> => {
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
          "X-Title": params.title,
        },
        body: JSON.stringify(params.body),
        // Menutup seluruh permintaan termasuk pembacaan badan respons — di
        // undici sinyal ini juga membatalkan stream, bukan cuma handshake-nya.
        signal: AbortSignal.timeout(perCallMs),
      });
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      const message = err instanceof Error ? err.message : String(err);
      if (name === "TimeoutError") {
        return { ok: false, error: `waktu habis setelah ${perCallMs}ms`, retryable: true };
      }
      // AbortError berarti pemanggil yang membatalkan; mengulanginya melawan
      // maksud pembatalan itu sendiri.
      return { ok: false, error: `jaringan: ${message}`, retryable: name !== "AbortError" };
    }

    if (!res.ok) {
      const text = (await res.text().catch(() => ""))
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200);
      return {
        ok: false,
        status: res.status,
        error: `HTTP ${res.status}: ${text}`,
        retryable: RETRYABLE_STATUS.has(res.status),
        retryAfterMs: parseRetryAfter(res.headers) ?? undefined,
      };
    }

    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    // 200 dengan badan yang tidak bisa diparse hampir selalu proxy yang
    // memotong respons di tengah — persis jenis gangguan yang layak diulang.
    if (!json || typeof json !== "object") {
      return { ok: false, status: res.status, error: "balasan penyedia bukan JSON", retryable: true };
    }
    return { ok: true, json, status: res.status };
  };

  let attempts = 0;
  let last: Attempt & { ok: false } = {
    ok: false,
    error: "belum ada percobaan",
    retryable: false,
  };

  for (;;) {
    const remaining = params.deadlineAt ? params.deadlineAt - Date.now() : Number.POSITIVE_INFINITY;
    if (remaining <= 0) {
      return {
        ok: false,
        status: last.status,
        retryable: false,
        attempts,
        error:
          attempts === 0
            ? "batas waktu total habis sebelum permintaan dikirim"
            : `${last.error} (batas waktu total habis)`,
      };
    }

    attempts += 1;
    const attempt = await once(Math.max(1_000, Math.min(timeoutMs, remaining)));
    if (attempt.ok) return { ok: true, json: attempt.json, status: attempt.status, attempts };

    last = attempt;
    if (!attempt.retryable || attempts > maxRetries) {
      return {
        ok: false,
        error: attempt.error,
        status: attempt.status,
        retryable: attempt.retryable,
        attempts,
      };
    }

    const delay = attempt.retryAfterMs ?? backoffFor(attempts);
    const left = params.deadlineAt ? params.deadlineAt - Date.now() : Number.POSITIVE_INFINITY;
    // Tidur melewati batas waktu total hanya menukar satu kegagalan dengan
    // kegagalan yang sama beberapa detik kemudian.
    if (delay >= left) {
      return {
        ok: false,
        error: `${attempt.error} (batas waktu total habis sebelum sempat diulang)`,
        status: attempt.status,
        retryable: false,
        attempts,
      };
    }
    await sleeper(delay);
  }
}
