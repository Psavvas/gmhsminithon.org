import { useEffect, useRef, useState } from "react";
import { useShooAuth } from "@shoojs/react";
import MemberAuthError from "./MemberAuthError";
import {
  consumePersistedSessionError,
  parseSessionError,
  persistSessionError,
  type ParsedSessionError,
} from "./sessionErrors";
import { persistAuthReturnPath } from "./authReturn";

type MemberSignupProps = {
  shooBaseUrl: string;
  callbackPath: string;
  signupPath: string;
  membersPath: string;
  loginPath: string;
  redeemEndpoint: string;
};

const MEMBER_AUTH_COMPLETE_PARAM = "memberAuth";
const MEMBER_AUTH_COMPLETE_VALUE = "complete";
/**
 * Shoo sign-in navigates away from this page, so the typed code is parked here
 * for the round trip and cleared the moment it has been used.
 */
const ACCESS_CODE_STORAGE_KEY = "member-signup-access-code";

export default function MemberSignup({
  shooBaseUrl,
  callbackPath,
  signupPath,
  membersPath,
  loginPath,
  redeemEndpoint,
}: MemberSignupProps) {
  const { clearIdentity, error, identity, loading, signIn } = useShooAuth({
    shooBaseUrl,
    callbackPath,
    autoSessionMonitor: false,
  });
  const completionHandledRef = useRef(false);
  const [accessCode, setAccessCode] = useState("");
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

    const storedCode =
      window.sessionStorage.getItem(ACCESS_CODE_STORAGE_KEY) || "";
    window.sessionStorage.removeItem(ACCESS_CODE_STORAGE_KEY);

    if (!identity.token) {
      clearCompletionParam();
      setErrorState({
        message: "Shoo sign-in completed, but no session token was available.",
      });
      return;
    }

    if (!storedCode) {
      clearCompletionParam();
      setErrorState({
        message:
          "Your access code was not carried through sign-in. Enter it again below.",
      });
      return;
    }

    setErrorState(null);
    setIsWorking(true);

    void (async () => {
      try {
        const response = await fetch(redeemEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idToken: identity.token,
            accessCode: storedCode,
          }),
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw parseSessionError(payload);
        }

        window.location.replace(membersPath);
      } catch (completionError) {
        const parsedError = toParsedError(completionError);

        persistSessionError(parsedError);
        clearIdentity();
        clearCompletionParam();
        setErrorState(parsedError);
        setAccessCode("");
      } finally {
        setIsWorking(false);
      }
    })();
  }, [clearIdentity, identity.token, loading, membersPath, redeemEndpoint]);

  const trimmedCode = accessCode.trim();
  const buttonLabel = isWorking
    ? "Setting up your access..."
    : loading
      ? "Loading Shoo..."
      : "Continue with Shoo";

  const handleSignIn = async () => {
    if (loading || isWorking || !trimmedCode) {
      return;
    }

    setErrorState(null);
    setIsWorking(true);

    try {
      window.sessionStorage.setItem(ACCESS_CODE_STORAGE_KEY, trimmedCode);
      persistAuthReturnPath(signupPath);
      await signIn({
        returnTo: `${signupPath}?${MEMBER_AUTH_COMPLETE_PARAM}=${MEMBER_AUTH_COMPLETE_VALUE}`,
      });
    } catch (signInError) {
      window.sessionStorage.removeItem(ACCESS_CODE_STORAGE_KEY);
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
    <form
      className="signup-panel"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSignIn();
      }}
    >
      {errorState && (
        <MemberAuthError
          message={errorState.message}
          userId={errorState.userId}
        />
      )}

      <div className="signup-field">
        <label className="signup-label" htmlFor="member-access-code">
          Access code
        </label>
        <input
          id="member-access-code"
          name="accessCode"
          className="signup-input"
          type="text"
          value={accessCode}
          onChange={(event) => setAccessCode(event.target.value)}
          placeholder="Enter the code from an officer"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={isWorking}
          required
        />
        <p className="signup-hint">
          Capitalization does not matter. Ask an officer if you do not have the
          code.
        </p>
      </div>

      <button
        type="submit"
        className="submit-button"
        disabled={loading || isWorking || !trimmedCode}
      >
        {buttonLabel}
      </button>

      <p className="signup-footnote">
        Already approved? <a href={loginPath}>Sign in instead</a>.
      </p>
    </form>
  );
}

function toParsedError(error: unknown): ParsedSessionError {
  if (error instanceof Error) {
    return { message: error.message };
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    return {
      message:
        typeof error.message === "string"
          ? error.message
          : "We could not finish setting up your access.",
      userId:
        "userId" in error && typeof error.userId === "string"
          ? error.userId
          : undefined,
    };
  }

  return { message: "We could not finish setting up your access." };
}
