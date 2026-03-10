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
  loginPath: string;
  membersPath: string;
  sessionEndpoint: string;
  showConfigurationNotice?: boolean;
};

const MEMBER_AUTH_COMPLETE_PARAM = "memberAuth";
const MEMBER_AUTH_COMPLETE_VALUE = "complete";

export default function MemberLogin({
  shooBaseUrl,
  callbackPath,
  loginPath,
  membersPath,
  sessionEndpoint,
  showConfigurationNotice = false,
}: MemberLoginProps) {
  const { clearIdentity, error, identity, loading, signIn } = useShooAuth({
    shooBaseUrl,
    callbackPath,
    autoSessionMonitor: false,
  });
  const completionHandledRef = useRef(false);
  const [errorState, setErrorState] = useState<ParsedSessionError | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    const persistedError = consumePersistedSessionError();

    if (persistedError) {
      setErrorState(persistedError);
    }
  }, []);

  useEffect(() => {
    if (error) {
      setIsWorking(false);
      setErrorState({ message: error });
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
    const isAuthCompletion =
      currentUrl.searchParams.get(MEMBER_AUTH_COMPLETE_PARAM) ===
      MEMBER_AUTH_COMPLETE_VALUE;

    if (!isAuthCompletion) {
      return;
    }

    completionHandledRef.current = true;

    const clearCompletionParam = () => {
      currentUrl.searchParams.delete(MEMBER_AUTH_COMPLETE_PARAM);
      window.history.replaceState(
        {},
        "",
        currentUrl.pathname + currentUrl.search,
      );
    };

    if (!identity.token) {
      clearCompletionParam();
      setErrorState({
        message: "Shoo sign-in completed, but no session token was available.",
      });
      return;
    }

    setErrorState(null);
    setIsWorking(true);

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

        window.location.replace(membersPath);
      } catch (completionError) {
        const parsedError =
          completionError instanceof Error
            ? {
                message: completionError.message,
              }
            : typeof completionError === "object" &&
                completionError !== null &&
                "message" in completionError
              ? {
                  message:
                    typeof completionError.message === "string"
                      ? completionError.message
                      : "We could not verify your member access.",
                  userId:
                    "userId" in completionError &&
                    typeof completionError.userId === "string"
                      ? completionError.userId
                      : undefined,
                }
              : {
                  message: "We could not verify your member access.",
                };

        persistSessionError(parsedError);
        clearIdentity();
        clearCompletionParam();
        setErrorState(parsedError);
      } finally {
        setIsWorking(false);
      }
    })();
  }, [clearIdentity, identity.token, loading, membersPath, sessionEndpoint]);

  const buttonLabel = isWorking
    ? "Completing sign-in..."
    : loading
      ? "Loading Shoo..."
      : "Continue with Shoo";

  const handleSignIn = async () => {
    if (loading || isWorking) {
      return;
    }

    setErrorState(null);
    setIsWorking(true);

    try {
      await signIn({
        returnTo: `${loginPath}?${MEMBER_AUTH_COMPLETE_PARAM}=${MEMBER_AUTH_COMPLETE_VALUE}`,
      });
    } catch (signInError) {
      setIsWorking(false);
      setErrorState({
        message:
          signInError instanceof Error
            ? signInError.message
            : "We could not start Shoo sign-in.",
      });
    }
  };

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
        onClick={() => void handleSignIn()}
        disabled={loading || isWorking}
      >
        {buttonLabel}
      </button>

      <p className="login-helper">
        Access is limited to approved GMHS Mini-THON members. If your account is
        not on the approved list yet, we will show your Shoo user ID so it can
        be added.
      </p>
    </div>
  );
}
