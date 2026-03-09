import { useEffect, useState } from "react";
import { useShooAuth } from "@shoojs/react";

type MemberAuthCallbackProps = {
  shooBaseUrl: string;
  callbackPath: string;
  membersPath: string;
  loginPath: string;
  sessionEndpoint: string;
};

export default function MemberAuthCallback({
  shooBaseUrl,
  callbackPath,
  membersPath,
  loginPath,
  sessionEndpoint,
}: MemberAuthCallbackProps) {
  const { clearIdentity, handleCallback } = useShooAuth({
    shooBaseUrl,
    callbackPath,
    requestPii: true,
    autoHandleCallback: false,
    autoSessionMonitor: false,
  });
  const [statusMessage, setStatusMessage] = useState(
    "Completing Shoo sign-in...",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

        setStatusMessage("Verifying member access...");

        const response = await fetch(sessionEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            idToken,
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
        clearIdentity();

        if (!cancelled) {
          setStatusMessage("Sign-in could not be completed.");
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "We could not verify your member access.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearIdentity, handleCallback, membersPath, sessionEndpoint]);

  return (
    <div className="callback-status">
      <p>{statusMessage}</p>

      {errorMessage && (
        <>
          <div className="error-message">{errorMessage}</div>
          <a href={loginPath} className="callback-link">
            Return to member login
          </a>
        </>
      )}
    </div>
  );
}
