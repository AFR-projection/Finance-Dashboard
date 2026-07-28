export const CLIENT_MESSAGE_MARKER = "__clientMessage" as const;

export type ClientMessageToolResult = {
  [CLIENT_MESSAGE_MARKER]: string;
};

export function getClientMessage(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const message = (value as Record<string, unknown>)[CLIENT_MESSAGE_MARKER];
  return typeof message === "string" && message.trim() ? message : undefined;
}
