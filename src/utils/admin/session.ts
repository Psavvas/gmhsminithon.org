/**
 * Admin portal sessions.
 *
 * Sign-in goes through Shoo exactly like the member portal does; the extra step
 * is that the Shoo user ID must also be on the admin list. The resulting cookie
 * is separate from the member cookie and shorter-lived, and every request
 * re-checks the admin list so removing an ID takes effect right away.
 */
import { SignJWT, jwtVerify } from "jose";
import { readBooleanEnv, readEnv } from "../env";
import { getShooAudienceOriginsForRequest } from "../auth";
import { isAdminSubject } from "./access";

export const ADMIN_HOME_PATH = "/admin";
export const ADMIN_LOGIN_PATH = "/admin/login";
export const ADMIN_AUTH_CALLBACK_PATH = "/admin/auth/callback";

const ADMIN_SESSION_COOKIE = "admin_session";
const ADMIN_SESSION_ISSUER = "gmhs-minithon-admin-session";
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export type AdminSession = {
  pairwiseSub: string;
};

export function getAdminSessionSecret(): Uint8Array | null {
  const secret =
    readEnv("ADMIN_SESSION_SECRET") ?? readEnv("MEMBER_SESSION_SECRET");

  if (!secret || secret.length < 16) {
    return null;
  }

  return new TextEncoder().encode(secret);
}

export function isAdminSessionConfigured(): boolean {
  return getAdminSessionSecret() !== null;
}

function getAdminSessionIssuer(request: Request): string {
  return `${ADMIN_SESSION_ISSUER}:${new URL(request.url).origin}`;
}

export async function createAdminSessionCookie(
  pairwiseSub: string,
  request: Request,
): Promise<string | null> {
  const secret = getAdminSessionSecret();

  if (!secret) {
    return null;
  }

  const token = await new SignJWT({ admin: true, pairwise_sub: pairwiseSub })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(getAdminSessionIssuer(request))
    .setSubject(pairwiseSub)
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_MAX_AGE_SECONDS}s`)
    .sign(secret);

  return buildCookie(token, ADMIN_SESSION_MAX_AGE_SECONDS, request);
}

export function clearAdminSessionCookie(request?: Request): string {
  return buildCookie("", 0, request);
}

function buildCookie(
  value: string,
  maxAgeSeconds: number,
  request?: Request,
): string {
  const attributes = [
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (request && new URL(request.url).protocol === "https:") {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

function getAdminTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") || "";

  for (const cookie of cookieHeader.split(";")) {
    const separatorIndex = cookie.indexOf("=");

    if (separatorIndex < 1) {
      continue;
    }

    const name = cookie.slice(0, separatorIndex).trim();

    if (name !== ADMIN_SESSION_COOKIE) {
      continue;
    }

    const value = cookie.slice(separatorIndex + 1).trim();

    if (!value) {
      return null;
    }

    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * The signed-in admin, or null. Also returns null when the ID has since been
 * removed from the admin list.
 */
export async function getAdminSession(
  request: Request,
): Promise<AdminSession | null> {
  const secret = getAdminSessionSecret();
  const token = getAdminTokenFromRequest(request);

  if (!secret || !token) {
    return null;
  }

  let pairwiseSub: string;

  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: getAdminSessionIssuer(request),
    });

    if (payload.admin !== true || typeof payload.pairwise_sub !== "string") {
      return null;
    }

    pairwiseSub = payload.pairwise_sub;
  } catch {
    return null;
  }

  if (!(await isAdminSubject(pairwiseSub))) {
    logAdmin("warn", "session.no_longer_admin", {
      userId: redactShooSub(pairwiseSub),
    });
    return null;
  }

  return { pairwiseSub };
}

export async function isAdminRequest(request: Request): Promise<boolean> {
  return (await getAdminSession(request)) !== null;
}

export function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export function jsonError(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

/**
 * Rejects cross-site writes. `SameSite=Lax` already keeps the cookie off
 * cross-site requests; this is a second, explicit check.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");

  if (!origin) {
    // Same-origin fetch() always sends Origin for non-GET requests.
    return false;
  }

  try {
    return getShooAudienceOriginsForRequest(request).includes(
      new URL(origin).origin,
    );
  } catch {
    return false;
  }
}

export type AdminApiGuard =
  | { ok: true; session: AdminSession }
  | { ok: false; response: Response };

/**
 * Guard for admin API routes: checks the session and, for writes, the origin.
 */
export async function guardAdminApiRequest(
  request: Request,
  options: { requireSameOrigin?: boolean } = {},
): Promise<AdminApiGuard> {
  if (!isAdminSessionConfigured()) {
    return {
      ok: false,
      response: jsonError(
        "The admin portal is missing ADMIN_SESSION_SECRET, so it cannot verify sessions.",
        503,
      ),
    };
  }

  if (options.requireSameOrigin !== false && !isSameOriginRequest(request)) {
    return {
      ok: false,
      response: jsonError(
        "This request was blocked for security reasons.",
        403,
      ),
    };
  }

  const session = await getAdminSession(request);

  if (!session) {
    return {
      ok: false,
      response: jsonError("You need to sign in as an admin first.", 401),
    };
  }

  return { ok: true, session };
}

export function redactShooSub(pairwiseSub: string): string {
  if (pairwiseSub.length <= 8) {
    return "***";
  }

  return `${pairwiseSub.slice(0, 4)}...${pairwiseSub.slice(-4)}`;
}

export function logAdmin(
  level: "debug" | "info" | "warn" | "error",
  event: string,
  details: Record<string, unknown> = {},
): void {
  const isDebugLevel = level === "debug" || level === "info";

  if (
    isDebugLevel &&
    !readBooleanEnv("ADMIN_AUTH_DEBUG") &&
    !readBooleanEnv("MEMBER_AUTH_DEBUG")
  ) {
    return;
  }

  const logger = console[level] ?? console.log;
  logger("[admin]", {
    level,
    event,
    ...details,
    timestamp: new Date().toISOString(),
  });
}
