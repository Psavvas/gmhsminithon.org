export type SessionErrorPayload = {
  error?: string;
  userId?: string;
};

export type ParsedSessionError = {
  message: string;
  userId?: string;
};

const MEMBER_AUTH_ERROR_STORAGE_KEY = "member-auth-error";

export function parseSessionError(
  payload: SessionErrorPayload | null,
): ParsedSessionError {
  return {
    message: payload?.error || "We could not verify your member access.",
    userId: payload?.userId,
  };
}

export function persistSessionError(error: ParsedSessionError): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    MEMBER_AUTH_ERROR_STORAGE_KEY,
    JSON.stringify(error),
  );
}

export function consumePersistedSessionError(): ParsedSessionError | null {
  if (typeof window === "undefined") {
    return null;
  }

  const serializedError = window.sessionStorage.getItem(
    MEMBER_AUTH_ERROR_STORAGE_KEY,
  );

  if (!serializedError) {
    return null;
  }

  window.sessionStorage.removeItem(MEMBER_AUTH_ERROR_STORAGE_KEY);

  try {
    const parsedError = JSON.parse(serializedError) as ParsedSessionError;

    if (!parsedError || typeof parsedError.message !== "string") {
      return null;
    }

    return {
      message: parsedError.message,
      userId:
        typeof parsedError.userId === "string" ? parsedError.userId : undefined,
    };
  } catch {
    return null;
  }
}
