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

  return (
    <form action={logoutEndpoint} method="POST" onSubmit={() => void handleLogout()}>
      <input type="hidden" name="returnTo" value={loginPath} />
      <button type="submit" className="member-logout" disabled={isLoggingOut}>
        {isLoggingOut ? "Signing out..." : "Sign Out"}
      </button>
    </form>
  );
}
