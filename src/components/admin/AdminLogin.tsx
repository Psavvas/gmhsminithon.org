import { useEffect, useRef, useState } from "react";
import { useShooAuth } from "@shoojs/react";

type AdminLoginProps = {
  shooBaseUrl: string;
  callbackPath: string;
  loginPath: string;
  adminHomePath: string;
  sessionEndpoint: string;
  configurationNotice?: string;
  /** Host this ID belongs to — Shoo IDs differ per web address. */
  originHost?: string;
};

type LoginError = {
  message: string;
  userId?: string;
};

const ADMIN_AUTH_COMPLETE_PARAM = "adminAuth";
const ADMIN_AUTH_COMPLETE_VALUE = "complete";
const ADMIN_AUTH_ERROR_STORAGE_KEY = "admin-auth-error";

function persistError(error: LoginError): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    ADMIN_AUTH_ERROR_STORAGE_KEY,
    JSON.stringify(error),
  );
}

function consumePersistedError(): LoginError | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.sessionStorage.getItem(ADMIN_AUTH_ERROR_STORAGE_KEY);

  if (!stored) {
    return null;
  }

  window.sessionStorage.removeItem(ADMIN_AUTH_ERROR_STORAGE_KEY);

  try {
    const parsed = JSON.parse(stored) as LoginError;

    return typeof parsed?.message === "string"
      ? {
          message: parsed.message,
          userId: typeof parsed.userId === "string" ? parsed.userId : undefined,
        }
      : null;
  } catch {
    return null;
  }
}

export default function AdminLogin({
  shooBaseUrl,
  callbackPath,
  loginPath,
  adminHomePath,
  sessionEndpoint,
  configurationNotice,
  originHost,
}: AdminLoginProps) {
  const { clearIdentity, error, identity, loading, signIn } = useShooAuth({
    shooBaseUrl,
    callbackPath,
    autoSessionMonitor: false,
  });
  const completionHandledRef = useRef(false);
  const [loginError, setLoginError] = useState<LoginError | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const persisted = consumePersistedError();

    if (persisted) {
      setLoginError(persisted);
    }
  }, []);

  useEffect(() => {
    if (error) {
      setIsWorking(false);
      setLoginError({ message: error });
    }
  }, [error]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      loading ||
      completionHandledRef.current
    ) {
      return;
    }

    const currentUrl = new URL(window.location.href);
    const isCompletion =
      currentUrl.searchParams.get(ADMIN_AUTH_COMPLETE_PARAM) ===
      ADMIN_AUTH_COMPLETE_VALUE;

    if (!isCompletion) {
      return;
    }

    completionHandledRef.current = true;

    const clearCompletionParam = () => {
      currentUrl.searchParams.delete(ADMIN_AUTH_COMPLETE_PARAM);
      window.history.replaceState(
        {},
        "",
        currentUrl.pathname + currentUrl.search,
      );
    };

    if (!identity.token) {
      clearCompletionParam();
      setLoginError({
        message: "Shoo sign-in finished, but no session token came back.",
      });
      return;
    }

    setLoginError(null);
    setIsWorking(true);

    void (async () => {
      try {
        const response = await fetch(sessionEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken: identity.token }),
        });
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          userId?: string;
        } | null;

        if (!response.ok) {
          throw {
            message:
              payload?.error ?? "We could not confirm your admin access.",
            userId: payload?.userId,
          } satisfies LoginError;
        }

        window.location.replace(adminHomePath);
      } catch (completionError) {
        const parsed: LoginError =
          completionError instanceof Error
            ? { message: completionError.message }
            : typeof completionError === "object" &&
                completionError !== null &&
                "message" in completionError
              ? (completionError as LoginError)
              : { message: "We could not confirm your admin access." };

        persistError(parsed);
        clearIdentity();
        clearCompletionParam();
        setLoginError(parsed);
      } finally {
        setIsWorking(false);
      }
    })();
  }, [adminHomePath, clearIdentity, identity.token, loading, sessionEndpoint]);

  const handleSignIn = async () => {
    if (loading || isWorking) {
      return;
    }

    setLoginError(null);
    setIsWorking(true);

    try {
      await signIn({
        returnTo: `${loginPath}?${ADMIN_AUTH_COMPLETE_PARAM}=${ADMIN_AUTH_COMPLETE_VALUE}`,
      });
    } catch (signInError) {
      setIsWorking(false);
      setLoginError({
        message:
          signInError instanceof Error
            ? signInError.message
            : "We could not start Shoo sign-in.",
      });
    }
  };

  const handleCopyUserId = async (userId: string) => {
    try {
      await navigator.clipboard.writeText(userId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const buttonLabel = isWorking
    ? "Signing in…"
    : loading
      ? "Loading Shoo…"
      : "Continue with Shoo";

  return (
    <div className="admin-login">
      {configurationNotice && (
        <p className="admin-callout admin-callout--warning">
          {configurationNotice}
        </p>
      )}

      {loginError && (
        <div className="admin-callout admin-callout--error" role="alert">
          <p>{loginError.message}</p>
          {loginError.userId && (
            <>
              <div className="admin-login__user-id">
                <span>
                  {originHost
                    ? `Your Shoo user ID on ${originHost}`
                    : "Your Shoo user ID"}
                </span>
                <code>{loginError.userId}</code>
                <button
                  type="button"
                  className="admin-button admin-button--ghost admin-button--small"
                  onClick={() =>
                    void handleCopyUserId(loginError.userId as string)
                  }
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="admin-field__help">
                Shoo issues a different ID for every web address, so add this
                exact value to ADMIN_APPROVED_SHOO_SUBS
                {originHost ? ` for ${originHost}` : ""}.
              </p>
            </>
          )}
        </div>
      )}

      <button
        type="button"
        className="admin-button admin-button--primary"
        onClick={() => void handleSignIn()}
        disabled={loading || isWorking}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
