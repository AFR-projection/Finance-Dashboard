export const CLIENT_MESSAGE_MARKER = "__clientMessage" as const;
export const VERIFIED_MUTATION_MARKER = "__verifiedMutation" as const;

export type ClientMessageToolResult = {
  [CLIENT_MESSAGE_MARKER]: string;
};

export type VerifiedMutation = {
  kind: "transaction.created" | "transaction.updated" | "transaction.deleted";
  entityId: string;
  walletId?: string;
};

export function getClientMessage(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const message = (value as Record<string, unknown>)[CLIENT_MESSAGE_MARKER];
  return typeof message === "string" && message.trim() ? message : undefined;
}

export function getVerifiedMutation(value: unknown): VerifiedMutation | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const receipt = (value as Record<string, unknown>)[VERIFIED_MUTATION_MARKER];
  if (typeof receipt !== "object" || receipt === null) return undefined;
  const candidate = receipt as Record<string, unknown>;
  if (
    (candidate.kind !== "transaction.created" &&
      candidate.kind !== "transaction.updated" &&
      candidate.kind !== "transaction.deleted") ||
    typeof candidate.entityId !== "string" ||
    !candidate.entityId
  ) {
    return undefined;
  }
  return {
    kind: candidate.kind,
    entityId: candidate.entityId,
    walletId: typeof candidate.walletId === "string" ? candidate.walletId : undefined,
  };
}
