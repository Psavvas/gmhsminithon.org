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

    try {
      await fetch(logoutEndpoint, {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
      });
    } finally {
      auth.clearIdentity();
      window.location.replace(loginPath);
    }
  };

  return (
    <button
      type="button"
      className="member-logout"
      onClick={() => void handleLogout()}
    >
      {isLoggingOut ? "Signing out..." : "Sign Out"}
    </button>
  );
}
