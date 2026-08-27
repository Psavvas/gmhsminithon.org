import { useEffect, useState } from "react";
import { useShooAuth } from "@shoojs/react";

type AdminAuthCallbackProps = {
  shooBaseUrl: string;
  callbackPath: string;
  loginPath: string;
};

export default function AdminAuthCallback({
  shooBaseUrl,
  callbackPath,
  loginPath,
}: AdminAuthCallbackProps) {
  const { clearIdentity, handleCallback } = useShooAuth({
    shooBaseUrl,
    callbackPath,
    autoHandleCallback: false,
    autoSessionMonitor: false,
  });
  const [statusMessage, setStatusMessage] = useState(
    "Completing Shoo sign-in…",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const tokenResponse = await handleCallback();

        if (!tokenResponse?.id_token) {
          throw new Error("Shoo did not return an id_token for this session.");
        }

        if (cancelled) {
          return;
        }

        setStatusMessage("Returning to the admin portal…");
        await handleCallback({
          redirectTo: `${loginPath}?adminAuth=complete`,
        });
      } catch (error) {
        clearIdentity();

        if (cancelled) {
          return;
        }

        setStatusMessage("Sign-in could not be completed.");
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Shoo sign-in could not be completed.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearIdentity, handleCallback, loginPath]);

  return (
    <div className="admin-login">
      <p>{statusMessage}</p>

      {errorMessage && (
        <>
          <p className="admin-callout admin-callout--error" role="alert">
            {errorMessage}
          </p>
          <a className="admin-button admin-button--ghost" href={loginPath}>
            Back to admin sign-in
          </a>
        </>
      )}
    </div>
  );
}
