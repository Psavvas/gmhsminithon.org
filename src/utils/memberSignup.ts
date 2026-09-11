/**
 * Self sign-up for the member portal.
 *
 * A member types the access code on /signup and signs in with Shoo. If the code
 * matches, their Shoo ID is written straight into `member_approvals` — the same
 * table the admin portal edits — so the Google Sheet round trip is optional.
 *
 * The code is only ever compared here, on the server. It is never sent to the
 * browser, and a wrong code tells the visitor nothing about the right one.
 */
import { addAccessEntry, getAccessListState } from "./admin/access";
import { getMemberSignupSettings } from "./content";
import { logMemberAuth, type MemberAuthLogContext } from "./auth";

/** Who the access list credits for a self sign-up, shown in the admin portal. */
export const SIGNUP_ACTOR = "signup";
export const SIGNUP_ENTRY_LABEL = "Signed up at /signup";

const FAILED_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const FAILED_ATTEMPT_LIMIT = 5;

const failedAttempts = new Map<string, { count: number; firstAt: number }>();

export type SignupRedemption =
  | { ok: true; status: "approved" | "already-approved" }
  | { ok: false; status: number; error: string };

/**
 * Codes are compared case-insensitively and without surrounding whitespace, so
 * a code read off a poster still works when it arrives as " ftk-2026 ".
 */
function normalizeAccessCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Constant-time comparison. A plain `===` leaks the length of the matching
 * prefix through timing, which is exactly what a guessing script measures.
 */
function codesMatch(candidate: string, expected: string): boolean {
  if (candidate.length !== expected.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < candidate.length; index += 1) {
    difference |= candidate.charCodeAt(index) ^ expected.charCodeAt(index);
  }

  return difference === 0;
}

/**
 * Guessing the code requires a verified Shoo account, and this caps how many
 * guesses one account gets. The counter lives in memory, so it is per instance
 * rather than global — a speed bump on top of the sign-in requirement, not the
 * only thing standing in the way.
 */
function registerFailedAttempt(key: string): boolean {
  const now = Date.now();
  const existing = failedAttempts.get(key);

  if (!existing || now - existing.firstAt > FAILED_ATTEMPT_WINDOW_MS) {
    failedAttempts.set(key, { count: 1, firstAt: now });
    return false;
  }

  existing.count += 1;

  return existing.count > FAILED_ATTEMPT_LIMIT;
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const existing = failedAttempts.get(key);

  if (!existing) {
    return false;
  }

  if (now - existing.firstAt > FAILED_ATTEMPT_WINDOW_MS) {
    failedAttempts.delete(key);
    return false;
  }

  return existing.count > FAILED_ATTEMPT_LIMIT;
}

function clearFailedAttempts(key: string): void {
  failedAttempts.delete(key);
}

export type SignupPageState = {
  enabled: boolean;
  closedMessage: string;
};

/**
 * What /signup may safely know about itself. Deliberately does not include the
 * code: an "open" page and a "closed" page are the only two states a visitor
 * can see.
 */
export async function getSignupPageState(): Promise<SignupPageState> {
  const settings = await getMemberSignupSettings();

  return {
    enabled:
      Boolean(settings.enabled) &&
      normalizeAccessCode(settings.accessCode) !== "",
    closedMessage: settings.closedMessage?.trim() ?? "",
  };
}

export async function redeemSignupCode(
  input: { pairwiseSub: string; accessCode: unknown },
  logContext?: MemberAuthLogContext,
): Promise<SignupRedemption> {
  const { pairwiseSub } = input;
  const settings = await getMemberSignupSettings();
  const expectedCode = normalizeAccessCode(settings.accessCode);
  const submittedCode = normalizeAccessCode(input.accessCode);

  if (!settings.enabled || !expectedCode) {
    logMemberAuth("warn", "signup.closed", {}, logContext);
    return {
      ok: false,
      status: 403,
      error:
        settings.closedMessage?.trim() ||
        "Member sign-ups are closed right now. Ask an officer to add you.",
    };
  }

  if (!submittedCode) {
    return { ok: false, status: 400, error: "Enter the access code." };
  }

  if (isRateLimited(pairwiseSub)) {
    logMemberAuth("warn", "signup.rate_limited", {}, logContext);
    return {
      ok: false,
      status: 429,
      error:
        "Too many incorrect codes. Wait a few minutes and try again, or ask an officer to add you.",
    };
  }

  if (!codesMatch(submittedCode, expectedCode)) {
    const nowLimited = registerFailedAttempt(pairwiseSub);
    logMemberAuth("warn", "signup.code_rejected", { nowLimited }, logContext);
    return {
      ok: false,
      status: 403,
      error: "That access code is not right. Check it with an officer.",
    };
  }

  clearFailedAttempts(pairwiseSub);

  // Already on the list (added by an admin, the sheet, or an earlier sign-up):
  // nothing to write, and the caller still gets a session.
  const memberState = await getAccessListState("members", {
    forceRefresh: true,
  });

  if (memberState.subjects.has(pairwiseSub)) {
    logMemberAuth("info", "signup.already_approved", {}, logContext);
    return { ok: true, status: "already-approved" };
  }

  const result = await addAccessEntry(
    "members",
    { shooSub: pairwiseSub, label: SIGNUP_ENTRY_LABEL },
    SIGNUP_ACTOR,
  );

  if (!result.ok) {
    logMemberAuth(
      "error",
      "signup.write_failed",
      { error: result.error },
      logContext,
    );
    return { ok: false, status: result.status, error: result.error };
  }

  logMemberAuth("info", "signup.approved", {}, logContext);

  return { ok: true, status: "approved" };
}
