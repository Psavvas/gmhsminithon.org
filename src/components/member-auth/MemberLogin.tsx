import { useEffect, useRef, useState } from "react";
import { useShooAuth } from "@shoojs/react";
import { formatSessionError } from "./sessionErrors";

type MemberLoginProps = {
  shooBaseUrl: string;
  callbackPath: string;
  membersPath: string;
  sessionEndpoint: string;
  showConfigurationNotice?: boolean;
};

export default function MemberLogin({
  shooBaseUrl,
  callbackPath,
  membersPath,
  sessionEndpoint,
  showConfigurationNotice = false,
}: MemberLoginProps) {
  const { clearIdentity, error, identity, loading, signIn } = useShooAuth({
    shooBaseUrl,
    callbackPath,
    autoSessionMonitor: true,
  });
  const syncedTokenRef = useRef<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (loading || !identity.token) {
      return;
    }

    if (syncedTokenRef.current === identity.token) {
      return;
    }

    syncedTokenRef.current = identity.token;
    setErrorMessage(null);
    setIsSyncing(true);

    void (async () => {
      try {
        const response = await fetch(sessionEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            idToken: identity.token,
          }),
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(formatSessionError(payload));
        }

        window.location.assign(membersPath);
      } catch (error) {
        clearIdentity();
        syncedTokenRef.current = null;
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "We could not verify your member access.",
        );
      } finally {
        setIsSyncing(false);
      }
    })();
  }, [clearIdentity, identity.token, loading, membersPath, sessionEndpoint]);

  useEffect(() => {
    if (error) {
      setErrorMessage(error);
    }
  }, [error]);

  const buttonLabel = isSyncing
    ? "Checking member access..."
    : loading
      ? "Loading Shoo..."
      : "Continue with Shoo";

  return (
    <div className="member-login-panel">
      {errorMessage && <div className="error-message">{errorMessage}</div>}

      {showConfigurationNotice && (
        <div className="configuration-message">
          This deployment does not have an approved member list configured yet,
          so access cannot be granted yet. You can still sign in below to see
          your Shoo user ID and authorization status.
        </div>
      )}

      <button
        type="button"
        className="submit-button"
        onClick={() =>
          void signIn({
            returnTo: membersPath,
          })
        }
        disabled={loading || isSyncing}
      >
        {buttonLabel}
      </button>

      <p className="login-helper">
        Shoo handles sign-in and session management. This site only grants
        member access after your Shoo user ID matches a private server-side
        allowlist.
      </p>
    </div>
  );
}
