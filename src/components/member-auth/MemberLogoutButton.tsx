import { useState } from "react";
import { useShooAuth } from "@shoojs/react";

type MemberLogoutButtonProps = {
  shooBaseUrl: string;
  callbackPath: string;
  logoutEndpoint: string;
  loginPath: string;
};

export default function MemberLogoutButton({
  shooBaseUrl,
  callbackPath,
  logoutEndpoint,
  loginPath,
}: MemberLogoutButtonProps) {
  const auth = useShooAuth({
    shooBaseUrl,
    callbackPath,
    requestPii: true,
    autoSessionMonitor: false,
  });
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    auth.clearIdentity();
  };

  const logoutUrl = `${logoutEndpoint}?returnTo=${encodeURIComponent(loginPath)}`;

  return (
    <form action={logoutUrl} method="GET" onSubmit={() => void handleLogout()}>
      <button
        type="submit"
        className="member-logout"
        disabled={isLoggingOut}
        aria-label={isLoggingOut ? "Signing out" : "Sign out"}
        title={isLoggingOut ? "Signing out" : "Sign out"}
      >
        <svg
          className="member-logout-icon"
          viewBox="0 0 24 24"
          focusable="false"
          aria-hidden="true"
        >
          <path d="M16 3h-5a3 3 0 0 0-3 3v3a1 1 0 1 0 2 0V6a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-3a1 1 0 1 0-2 0v3a3 3 0 0 0 3 3h5a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3Z"></path>
          <path d="M3.29 12.71a1 1 0 0 1 0-1.42l3-3a1 1 0 1 1 1.42 1.42L6.41 11H14a1 1 0 1 1 0 2H6.41l1.3 1.29a1 1 0 0 1-1.42 1.42l-3-3Z"></path>
        </svg>
      </button>
    </form>
  );
}
