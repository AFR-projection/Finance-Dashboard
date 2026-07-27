/**
 * Phone helpers that stay country-agnostic: no hardcoded dial code, so an owner
 * in any country/operator can be matched.
 */

/** Below this, a suffix match is too weak to trust as an identity. */
const MIN_SIGNIFICANT_DIGITS = 8;

export function toPhoneDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * Strips the parts that vary by how a number was typed — international access
 * prefix (`00`) and national trunk prefix (`0`) — leaving the digits that
 * identify the subscriber.
 */
export function phoneMatchKey(value: string | null | undefined): string {
  const digits = toPhoneDigits(value);
  const withoutIddPrefix = digits.startsWith("00") ? digits.slice(2) : digits;
  return withoutIddPrefix.replace(/^0+/, "");
}

/**
 * True when both values plausibly denote the same subscriber. A stored number
 * missing its country code (`85568541476`) still matches the full E.164 form
 * WhatsApp reports (`6285568541476`).
 */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = phoneMatchKey(a);
  const right = phoneMatchKey(b);
  if (!left || !right) return false;
  if (left === right) return true;

  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  if (shorter.length < MIN_SIGNIFICANT_DIGITS) return false;
  return longer.endsWith(shorter);
}
