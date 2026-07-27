export type TelegramAccessConfirmation = {
  action: "approve" | "reject";
  code: string;
};

/** Parse the non-command formats advertised in owner notifications. */
export function parseTelegramAccessConfirmation(
  value: string,
): TelegramAccessConfirmation | null {
  const text = value.trim();
  const actionMatch = text.match(/^(approve|reject)\s+([a-zA-Z0-9]{4,16})$/i);

  if (actionMatch) {
    return {
      action: actionMatch[1].toLowerCase() as "approve" | "reject",
      code: actionMatch[2],
    };
  }

  // Access codes are generated from three random bytes: exactly six hex chars.
  if (/^[a-fA-F0-9]{6}$/.test(text)) {
    return { action: "approve", code: text };
  }

  return null;
}
