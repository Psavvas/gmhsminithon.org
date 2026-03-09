export type SessionErrorPayload = {
  error?: string;
  approvalId?: string;
};

export function formatSessionError(
  payload: SessionErrorPayload | null,
): string {
  const baseMessage =
    payload?.error || "We could not verify your member access.";

  if (!payload?.approvalId) {
    return baseMessage;
  }

  return `${baseMessage} Approval ID: ${payload.approvalId}`;
}
