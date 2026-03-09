import { useEffect, useRef, useState } from "react";
import { useShooAuth } from "@shoojs/react";

type MemberLoginProps = {
  shooBaseUrl: string;
  callbackPath: string;
  membersPath: string;
  sessionEndpoint: string;
};

export default function MemberLogin({
  shooBaseUrl,
  callbackPath,
  membersPath,
  sessionEndpoint,
}: MemberLoginProps) {
  const auth = useShooAuth({
    shooBaseUrl,
    callbackPath,
    requestPii: true,
    autoSessionMonitor: true,
  });
  const syncedTokenRef = useRef<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (auth.loading || !auth.identity.token) {
      return;
    }

    if (syncedTokenRef.current === auth.identity.token) {
      return;
    }

    syncedTokenRef.current = auth.identity.token;
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
            idToken: auth.identity.token,
          }),
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            payload?.error || "We could not verify your member access.",
          );
        }

        window.location.assign(membersPath);
      } catch (error) {
        auth.clearIdentity();
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
  }, [
    auth.clearIdentity,
    auth.identity.token,
    auth.loading,
    membersPath,
    sessionEndpoint,
  ]);

  useEffect(() => {
    if (auth.error) {
      setErrorMessage(auth.error);
    }
  }, [auth.error]);

  const buttonLabel = isSyncing
    ? "Checking member access..."
    : auth.loading
      ? "Loading Shoo..."
      : "Continue with Shoo";

  return (
    <div className="member-login-panel">
      {errorMessage && <div className="error-message">{errorMessage}</div>}

      <button
        type="button"
        className="submit-button"
        onClick={() =>
          void auth.signIn({
            requestPii: true,
            returnTo: membersPath,
          })
        }
        disabled={auth.loading || isSyncing}
      >
        {buttonLabel}
      </button>

      <p className="login-helper">
        Shoo handles sign-in and session management. This site only grants
        member access after your verified Shoo email matches the approved-user
        list.
      </p>
    </div>
  );
}
