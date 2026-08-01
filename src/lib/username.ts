/** Reserved because they collide with routes, subdomains, or support identity. */
const RESERVED = new Set([
  "admin",
  "administrator",
  "api",
  "app",
  "root",
  "support",
  "help",
  "ledgerly",
  "owner",
  "master",
  "system",
  "billing",
  "dashboard",
  "settings",
  "login",
  "logout",
  "daftar",
  "masuk",
  "register",
  "me",
  "null",
  "undefined",
]);

const SHAPE = /^[a-z0-9_]{3,20}$/;

export type UsernameCheck = { ok: true; value: string } | { ok: false; message: string };

/**
 * Lowercases before validating, so "Aldo" and "aldo" cannot become two accounts
 * that look identical in every UI that renders them.
 */
export function normalizeUsername(raw: string): UsernameCheck {
  const value = raw.trim().toLowerCase();

  if (value.length < 3) return { ok: false, message: "Username minimal 3 karakter." };
  if (value.length > 20) return { ok: false, message: "Username maksimal 20 karakter." };
  if (!SHAPE.test(value)) {
    return { ok: false, message: "Username hanya boleh huruf kecil, angka, dan garis bawah." };
  }
  if (RESERVED.has(value)) return { ok: false, message: "Username itu tidak tersedia." };

  return { ok: true, value };
}
