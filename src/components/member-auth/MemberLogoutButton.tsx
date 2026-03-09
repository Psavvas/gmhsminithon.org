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
      <button type="submit" className="member-logout" disabled={isLoggingOut}>
        {isLoggingOut ? "Signing out..." : "Sign Out"}
      </button>
    </form>
  );
}
