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
      auth.clearIdentity();
      await fetch(logoutEndpoint, {
        method: "POST",
      });
    } finally {
      window.location.assign(loginPath);
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
