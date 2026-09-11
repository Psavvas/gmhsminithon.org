/**
 * Where to land after Shoo sends the browser back.
 *
 * Shoo returns to one registered callback path, so the page that started the
 * sign-in leaves a note here saying where it wants to end up. Without a note,
 * the callback falls back to the member login page exactly as before.
 */
const AUTH_RETURN_PATH_STORAGE_KEY = "member-auth-return-path";

/** Same-site, absolute-from-root paths only — never "//evil.example". */
export function isSafeReturnPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
  );
}

export function persistAuthReturnPath(path: string): void {
  if (typeof window === "undefined" || !isSafeReturnPath(path)) {
    return;
  }

  window.sessionStorage.setItem(AUTH_RETURN_PATH_STORAGE_KEY, path);
}

export function consumeAuthReturnPath(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storedPath = window.sessionStorage.getItem(
    AUTH_RETURN_PATH_STORAGE_KEY,
  );

  if (!storedPath) {
    return null;
  }

  window.sessionStorage.removeItem(AUTH_RETURN_PATH_STORAGE_KEY);

  return isSafeReturnPath(storedPath) ? storedPath : null;
}
