import { useEffect, useRef, useState } from "react";
import { useShooAuth } from "@shoojs/react";
import MemberAuthError from "./MemberAuthError";
import {
  consumePersistedSessionError,
  parseSessionError,
  persistSessionError,
  type ParsedSessionError,
} from "./sessionErrors";

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
  const [errorState, setErrorState] = useState<ParsedSessionError | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const persistedError = consumePersistedSessionError();

    if (persistedError) {
      setErrorState(persistedError);
    }
  }, []);

  useEffect(() => {
    if (loading || !identity.token) {
      return;
    }

    if (syncedTokenRef.current === identity.token) {
      return;
    }

    syncedTokenRef.current = identity.token;
    setErrorState(null);
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
          throw parseSessionError(payload);
        }

        window.location.assign(membersPath);
      } catch (error) {
        const parsedError =
          error instanceof Error
            ? {
              message: error.message,
            }
            : typeof error === "object" && error !== null && "message" in error
              ? {
                message:
                  typeof error.message === "string"
                    ? error.message
                    : "We could not verify your member access.",
                userId:
                  "userId" in error && typeof error.userId === "string"
                    ? error.userId
                    : undefined,
              }
              : {
                message: "We could not verify your member access.",
              };

        persistSessionError(parsedError);
        clearIdentity();
        syncedTokenRef.current = null;
        setErrorState(parsedError);
      } finally {
        setIsSyncing(false);
      }
    })();
  }, [clearIdentity, identity.token, loading, membersPath, sessionEndpoint]);

  useEffect(() => {
    if (error) {
      setErrorState({ message: error });
    }
  }, [error]);

  const buttonLabel = isSyncing
    ? "Checking member access..."
    : loading
      ? "Loading Shoo..."
      : "Continue with Shoo";

  return (
    <div className="member-login-panel">
      {errorState && (
        <MemberAuthError
          message={errorState.message}
          userId={errorState.userId}
        />
      )}

      {showConfigurationNotice && (
        <div className="configuration-message">
          Member access is not fully configured yet. You can still sign in to
          confirm your Shoo user ID and share it with an admin for setup.
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
        Access is limited to approved GMHS Mini-THON members. If your account
        is not on the approved list yet, we will show your Shoo user ID so it
        can be added.
      </p>
    </div>
  );
}
