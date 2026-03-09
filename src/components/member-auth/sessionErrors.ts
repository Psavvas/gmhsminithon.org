export type SessionErrorPayload = {
  error?: string;
  userId?: string;
};

export function formatSessionError(
  payload: SessionErrorPayload | null,
): string {
  const baseMessage =
    payload?.error || "We could not verify your member access.";

  if (!payload?.userId) {
    return baseMessage;
  }

  return `${baseMessage} User ID: ${payload.userId}`;
}
