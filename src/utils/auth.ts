import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const DEFAULT_SHOO_BASE_URL = "https://shoo.dev";
const MEMBER_SESSION_COOKIE = "member_session";
export const MEMBER_LOGIN_PATH = "/members/login";
export const MEMBER_HOME_PATH = "/members";
export const MEMBER_AUTH_CALLBACK_PATH = "/members/auth/callback";
const MEMBER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;
const SHOO_BASE_URL =
  import.meta.env.PUBLIC_SHOO_BASE_URL || DEFAULT_SHOO_BASE_URL;
const SHOO_ISSUER = SHOO_BASE_URL;
const shooJwks = createRemoteJWKSet(
  new URL("/.well-known/jwks.json", SHOO_BASE_URL),
);

type ShooVerifiedToken = JWTPayload & {
  pairwise_sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export function getShooBaseUrl(): string {
  return SHOO_BASE_URL;
}

export function hasApprovedMemberSubjects(): boolean {
  return getApprovedMemberSubjects().size > 0;
}

export function isApprovedMemberSubject(pairwiseSub?: string | null): boolean {
  if (!pairwiseSub) {
    return false;
  }

  return getApprovedMemberSubjects().has(pairwiseSub.trim());
}

export async function verifyShooToken(
  idToken: string,
  appOrigin: string,
): Promise<ShooVerifiedToken> {
  const audience = `origin:${new URL(appOrigin).origin}`;
  const { payload } = await jwtVerify(idToken, shooJwks, {
    issuer: SHOO_ISSUER,
    audience,
  });

  if (typeof payload.pairwise_sub !== "string") {
    throw new Error("Shoo token missing pairwise_sub");
  }

  return payload as ShooVerifiedToken;
}

export async function getAuthorizedMemberSession(
  request: Request,
): Promise<ShooVerifiedToken | null> {
  const token = getMemberTokenFromRequest(request);

  if (!token) {
    return null;
  }

  try {
    const payload = await verifyShooToken(token, request.url);

    if (!isApprovedMemberSubject(payload.pairwise_sub)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function parseApprovedMemberSubjects(
  rawSubjects?: string,
): ReadonlySet<string> {
  if (!rawSubjects) {
    return new Set();
  }

  return new Set(
    rawSubjects
      .split(/[,\n\r]+/)
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function getApprovedMemberSubjects(): ReadonlySet<string> {
  return parseApprovedMemberSubjects(import.meta.env.MEMBER_APPROVED_SHOO_SUBS);
}

export async function checkMemberAuth(request: Request): Promise<boolean> {
  return (await getAuthorizedMemberSession(request)) !== null;
}

export function setMemberAuthCookie(token: string, request: Request): string {
  const attributes = [
    `${MEMBER_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${MEMBER_SESSION_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (new URL(request.url).protocol === "https:") {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

export function clearMemberAuthCookie(request?: Request): string {
  const attributes = [
    `${MEMBER_SESSION_COOKIE}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (request && new URL(request.url).protocol === "https:") {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

function getMemberTokenFromRequest(request: Request): string | null {
  const cookies = parseCookies(request.headers.get("cookie") || "");
  const token = cookies[MEMBER_SESSION_COOKIE];

  if (!token) {
    return null;
  }

  try {
    return decodeURIComponent(token);
  } catch {
    return null;
  }
}

function parseCookies(cookieString: string): Record<string, string> {
  return cookieString
    .split(";")
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .reduce(
      (acc, cookie) => {
        const separatorIndex = cookie.indexOf("=");

        if (separatorIndex < 1) {
          return acc;
        }

        const key = cookie.slice(0, separatorIndex);
        const value = cookie.slice(separatorIndex + 1);

        if (key && value) {
          acc[key] = value;
        }

        return acc;
      },
      {} as Record<string, string>,
    );
}
