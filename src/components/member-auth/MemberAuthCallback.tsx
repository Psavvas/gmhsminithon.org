import { useEffect, useState } from "react";
import { useShooAuth } from "@shoojs/react";
import MemberAuthError from "./MemberAuthError";
import { persistSessionError, type ParsedSessionError } from "./sessionErrors";
import { consumeAuthReturnPath } from "./authReturn";

type MemberAuthCallbackProps = {
  shooBaseUrl: string;
  callbackPath: string;
  loginPath: string;
};

export default function MemberAuthCallback({
  shooBaseUrl,
  callbackPath,
  loginPath,
}: MemberAuthCallbackProps) {
  const { clearIdentity, handleCallback } = useShooAuth({
    shooBaseUrl,
    callbackPath,
    autoHandleCallback: false,
    autoSessionMonitor: false,
  });
  const [statusMessage, setStatusMessage] = useState(
    "Completing Shoo sign-in...",
  );
  const [errorState, setErrorState] = useState<ParsedSessionError | null>(null);
  // The page that started sign-in may have asked to be returned to; /signup
  // does, the member login page does not and keeps the old behaviour.
  const [returnPath] = useState(() => consumeAuthReturnPath() ?? loginPath);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const tokenResponse = await handleCallback();
        const idToken = tokenResponse?.id_token || null;

        if (!idToken) {
          throw new Error("Shoo did not return an id_token for this session.");
        }

        if (cancelled) {
          return;
        }

        setStatusMessage("Redirecting back to sign-in...");
        await handleCallback({
          redirectTo: withAuthCompleteParam(returnPath),
        });
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

        if (!cancelled) {
          setStatusMessage("Sign-in could not be completed.");
          setErrorState(parsedError);
          window.location.assign(returnPath);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearIdentity, handleCallback, returnPath]);

  return (
    <div className="callback-status">
      <p>{statusMessage}</p>

      {errorState && (
        <>
          <MemberAuthError
            message={errorState.message}
            userId={errorState.userId}
          />
          <a href={returnPath} className="callback-link">
            Go back and try again
          </a>
        </>
      )}
    </div>
  );
}

function withAuthCompleteParam(path: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}memberAuth=complete`;
}
