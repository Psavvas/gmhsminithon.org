import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from "jose";

const DEFAULT_SHOO_BASE_URL = "https://shoo.dev";
const MEMBER_SESSION_COOKIE = "member_session";
const MEMBER_SESSION_ISSUER = "gmhs-minithon-member-session";
export const MEMBER_LOGIN_PATH = "/members/login";
export const MEMBER_HOME_PATH = "/members";
export const MEMBER_AUTH_CALLBACK_PATH = "/members/auth/callback";
const MEMBER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;
const APPROVED_MEMBER_SHEET_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const APPROVED_MEMBER_SHEET_FETCH_TIMEOUT_MS = 10_000;
const APPROVED_MEMBER_SHEET_FETCH_RETRY_DELAY_MS = 750;
const APPROVED_MEMBER_SHEET_FETCH_RETRY_COUNT = 1;
const APPROVED_MEMBER_SHEET_MAX_RESPONSE_CHARS = 100_000;
const APPROVED_MEMBER_SHEET_BACKGROUND_REFRESH_MIN_INTERVAL_MS = 60 * 1000;
const APPROVED_MEMBER_SHEET_AUTH_MISS_REFRESH_MIN_INTERVAL_MS = 60 * 1000;
const SHOO_BASE_URL =
  import.meta.env.PUBLIC_SHOO_BASE_URL || DEFAULT_SHOO_BASE_URL;
const SHOO_ISSUER = SHOO_BASE_URL;
const shooJwks = createRemoteJWKSet(
  new URL("/.well-known/jwks.json", SHOO_BASE_URL),
);
type ApprovedMemberSheetCacheEntry = {
  url: string;
  expiresAt: number;
  subjects: ReadonlySet<string>;
  eTag?: string;
  lastModified?: string;
};

let approvedMemberSheetCache: ApprovedMemberSheetCacheEntry | undefined;
let approvedMemberSheetFetchPromise:
  | Promise<ApprovedMemberSheetCacheEntry>
  | undefined;
let approvedMemberSheetLastBackgroundRefreshAt = 0;
let approvedMemberSheetLastForcedRefreshAt = 0;

type ShooVerifiedToken = JWTPayload & {
  pairwise_sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

type AuthorizedMemberSession = {
  pairwise_sub: string;
};

type MemberAuthLogContext = {
  requestId?: string;
  route?: string;
};

type ApprovedMemberSubjectsState = {
  isConfigured: boolean;
  loadError?: string;
  subjects: ReadonlySet<string>;
  cacheStatus: "fresh" | "stale" | "missing";
  refreshTriggered: boolean;
};

type ApprovedMemberSubjectsOptions = {
  forceRefresh?: boolean;
  waitForRefresh?: boolean;
  logContext?: MemberAuthLogContext;
};

export function getShooBaseUrl(): string {
  return SHOO_BASE_URL;
}

export function hasMemberApprovalSourceConfigured(): boolean {
  return (
    parseApprovedMemberSubjects(getMemberApprovedShooSubsEnv()).size > 0 ||
    Boolean(getMemberApprovedGoogleSheetCsvUrl())
  );
}

export async function verifyShooToken(
  idToken: string,
  appOrigin: string | string[],
): Promise<ShooVerifiedToken> {
  const audiences = Array.isArray(appOrigin) ? appOrigin : [appOrigin];
  const audience = audiences.map((value) => `origin:${new URL(value).origin}`);
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
): Promise<AuthorizedMemberSession | null> {
  const logContext = createMemberAuthLogContext(request, "member-session");
  const token = getMemberTokenFromRequest(request);

  if (!token) {
    logMemberAuth("debug", "session.cookie_missing", {}, logContext);
    return null;
  }

  const verifiedMemberSession = await verifyMemberSessionCookie(token, request);

  if (verifiedMemberSession) {
    logMemberAuth(
      "debug",
      "session.server_cookie_verified",
      {
        userId: redactMemberUserId(verifiedMemberSession.pairwise_sub),
      },
      logContext,
    );
    return verifiedMemberSession;
  }

  try {
    const payload = await verifyShooToken(
      token,
      getShooAudienceOriginsForRequest(request),
    );
    const approvedMemberSubjectsState = await getApprovedMemberSubjectsState();

    if (!approvedMemberSubjectsState.subjects.has(payload.pairwise_sub)) {
      logMemberAuth(
        "warn",
        "session.legacy_cookie_not_approved",
        {
          userId: redactMemberUserId(payload.pairwise_sub),
          cacheStatus: approvedMemberSubjectsState.cacheStatus,
          loadError: approvedMemberSubjectsState.loadError,
        },
        logContext,
      );
      return null;
    }

    logMemberAuth(
      "debug",
      "session.legacy_cookie_verified",
      {
        userId: redactMemberUserId(payload.pairwise_sub),
      },
      logContext,
    );
    return payload;
  } catch (error) {
    logMemberAuth(
      "warn",
      "session.cookie_verification_failed",
      {
        error: error instanceof Error ? error.message : String(error),
      },
      logContext,
    );
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

export async function getApprovedMemberSubjectsState(
  options: ApprovedMemberSubjectsOptions = {},
): Promise<ApprovedMemberSubjectsState> {
  const envSubjects = parseApprovedMemberSubjects(
    getMemberApprovedShooSubsEnv(),
  );
  const googleSheetCsvUrl = getMemberApprovedGoogleSheetCsvUrl();
  const subjects = new Set(envSubjects);
  let loadError: string | undefined;
  let cacheStatus: ApprovedMemberSubjectsState["cacheStatus"] = "missing";
  let refreshTriggered = false;

  if (googleSheetCsvUrl) {
    try {
      const googleSheetState = await getApprovedMemberSubjectsFromGoogleSheet(
        googleSheetCsvUrl,
        options,
      );

      cacheStatus = googleSheetState.cacheStatus;
      refreshTriggered = googleSheetState.refreshTriggered;

      for (const subject of googleSheetState.subjects) {
        subjects.add(subject);
      }

      logMemberAuth(
        "debug",
        "approval.source_loaded",
        {
          cacheStatus,
          refreshTriggered,
          subjectCount: googleSheetState.subjects.size,
          hasEnvSubjects: envSubjects.size > 0,
        },
        options.logContext,
      );
    } catch (error) {
      loadError =
        error instanceof Error
          ? error.message
          : "The approved member Google Sheet could not be loaded.";

      logMemberAuth(
        "warn",
        "approval.source_failed",
        {
          error: loadError,
          hasEnvSubjects: envSubjects.size > 0,
        },
        options.logContext,
      );
    }
  }

  return {
    isConfigured: envSubjects.size > 0 || Boolean(googleSheetCsvUrl),
    loadError,
    subjects,
    cacheStatus,
    refreshTriggered,
  };
}

function getMemberApprovedShooSubsEnv(): string | undefined {
  if (
    typeof process !== "undefined" &&
    process.env?.MEMBER_APPROVED_SHOO_SUBS
  ) {
    return process.env.MEMBER_APPROVED_SHOO_SUBS;
  }

  return import.meta.env.MEMBER_APPROVED_SHOO_SUBS;
}

function getMemberApprovedGoogleSheetCsvUrl(): string | undefined {
  if (
    typeof process !== "undefined" &&
    process.env?.MEMBER_APPROVED_SHOO_SUBS_GOOGLE_SHEET_CSV_URL
  ) {
    return process.env.MEMBER_APPROVED_SHOO_SUBS_GOOGLE_SHEET_CSV_URL;
  }

  return import.meta.env.MEMBER_APPROVED_SHOO_SUBS_GOOGLE_SHEET_CSV_URL;
}

async function getApprovedMemberSubjectsFromGoogleSheet(
  googleSheetCsvUrl: string,
  options: ApprovedMemberSubjectsOptions = {},
): Promise<{
  subjects: ReadonlySet<string>;
  cacheStatus: ApprovedMemberSubjectsState["cacheStatus"];
  refreshTriggered: boolean;
}> {
  const now = Date.now();
  const cachedEntry =
    approvedMemberSheetCache?.url === googleSheetCsvUrl
      ? approvedMemberSheetCache
      : undefined;
  const hasFreshCache = Boolean(cachedEntry && cachedEntry.expiresAt > now);
  const shouldForceRefresh =
    options.forceRefresh &&
    (!cachedEntry ||
      now - approvedMemberSheetLastForcedRefreshAt >=
        APPROVED_MEMBER_SHEET_AUTH_MISS_REFRESH_MIN_INTERVAL_MS);
  const shouldRefreshStaleCache =
    !hasFreshCache &&
    Boolean(cachedEntry) &&
    now - approvedMemberSheetLastBackgroundRefreshAt >=
      APPROVED_MEMBER_SHEET_BACKGROUND_REFRESH_MIN_INTERVAL_MS;

  if (hasFreshCache && cachedEntry && !shouldForceRefresh) {
    logMemberAuth(
      "debug",
      "approval.cache_hit",
      {
        cacheStatus: "fresh",
        subjectCount: cachedEntry.subjects.size,
      },
      options.logContext,
    );
    return {
      subjects: cachedEntry.subjects,
      cacheStatus: "fresh",
      refreshTriggered: false,
    };
  }

  if (options.waitForRefresh) {
    logMemberAuth(
      "info",
      "approval.waiting_for_refresh",
      {
        hasCachedEntry: Boolean(cachedEntry),
        forceRefresh: shouldForceRefresh,
      },
      options.logContext,
    );
    const cacheEntry = await refreshApprovedMemberSheetCache(
      googleSheetCsvUrl,
      cachedEntry,
      {
        forceRefresh: shouldForceRefresh,
        logContext: options.logContext,
      },
    );
    approvedMemberSheetCache = cacheEntry;

    return {
      subjects: cacheEntry.subjects,
      cacheStatus: "fresh",
      refreshTriggered: false,
    };
  }

  if (!cachedEntry) {
    logMemberAuth("info", "approval.cache_miss", {}, options.logContext);
    const cacheEntry =
      await getApprovedMemberSheetCacheEntry(googleSheetCsvUrl);
    approvedMemberSheetCache = cacheEntry;
    return {
      subjects: cacheEntry.subjects,
      cacheStatus: "fresh",
      refreshTriggered: false,
    };
  }

  const assuredCachedEntry = cachedEntry;

  let refreshTriggered = false;

  if (shouldForceRefresh) {
    approvedMemberSheetLastForcedRefreshAt = now;
    refreshTriggered =
      startApprovedMemberSheetBackgroundRefresh(
        googleSheetCsvUrl,
        cachedEntry,
        options.logContext,
      ) || refreshTriggered;
  }

  if (shouldRefreshStaleCache) {
    approvedMemberSheetLastBackgroundRefreshAt = now;
    refreshTriggered =
      startApprovedMemberSheetBackgroundRefresh(
        googleSheetCsvUrl,
        cachedEntry,
        options.logContext,
      ) || refreshTriggered;
  }

  logMemberAuth(
    "debug",
    "approval.stale_cache_served",
    {
      refreshTriggered,
      subjectCount: assuredCachedEntry.subjects.size,
      forceRefreshRequested: options.forceRefresh === true,
    },
    options.logContext,
  );

  return {
    subjects: assuredCachedEntry.subjects,
    cacheStatus: hasFreshCache ? "fresh" : "stale",
    refreshTriggered,
  };
}

function startApprovedMemberSheetBackgroundRefresh(
  googleSheetCsvUrl: string,
  cachedEntry?: ApprovedMemberSheetCacheEntry,
  logContext?: MemberAuthLogContext,
): boolean {
  if (approvedMemberSheetFetchPromise) {
    logMemberAuth("debug", "approval.refresh_deduped", {}, logContext);
    return false;
  }

  logMemberAuth(
    "info",
    "approval.refresh_started",
    {
      hasCachedEntry: Boolean(cachedEntry),
    },
    logContext,
  );

  approvedMemberSheetFetchPromise = getApprovedMemberSheetCacheEntry(
    googleSheetCsvUrl,
    cachedEntry,
  ).finally(() => {
    approvedMemberSheetFetchPromise = undefined;
  });

  void approvedMemberSheetFetchPromise
    .then((cacheEntry) => {
      approvedMemberSheetCache = cacheEntry;
      logMemberAuth(
        "info",
        "approval.refresh_succeeded",
        {
          subjectCount: cacheEntry.subjects.size,
        },
        logContext,
      );
    })
    .catch((error) => {
      logMemberAuth(
        "warn",
        "approval.refresh_failed",
        {
          error: error instanceof Error ? error.message : String(error),
        },
        logContext,
      );
      // Keep serving the previous cache entry and try again later.
    });

  return true;
}

async function getApprovedMemberSheetCacheEntry(
  googleSheetCsvUrl: string,
  cachedEntry?: ApprovedMemberSheetCacheEntry,
): Promise<ApprovedMemberSheetCacheEntry> {
  return loadApprovedMemberSubjectsFromGoogleSheetWithRetry(
    googleSheetCsvUrl,
    cachedEntry,
  );
}

async function refreshApprovedMemberSheetCache(
  googleSheetCsvUrl: string,
  cachedEntry?: ApprovedMemberSheetCacheEntry,
  options: { forceRefresh?: boolean; logContext?: MemberAuthLogContext } = {},
): Promise<ApprovedMemberSheetCacheEntry> {
  const now = Date.now();

  if (approvedMemberSheetFetchPromise) {
    logMemberAuth("debug", "approval.refresh_joined", {}, options.logContext);
    const cacheEntry = await approvedMemberSheetFetchPromise;
    approvedMemberSheetCache = cacheEntry;
    return cacheEntry;
  }

  if (options.forceRefresh) {
    approvedMemberSheetLastForcedRefreshAt = now;
  } else {
    approvedMemberSheetLastBackgroundRefreshAt = now;
  }

  approvedMemberSheetFetchPromise = getApprovedMemberSheetCacheEntry(
    googleSheetCsvUrl,
    cachedEntry,
  ).finally(() => {
    approvedMemberSheetFetchPromise = undefined;
  });

  try {
    const cacheEntry = await approvedMemberSheetFetchPromise;
    approvedMemberSheetCache = cacheEntry;
    logMemberAuth(
      "info",
      "approval.refresh_completed",
      {
        subjectCount: cacheEntry.subjects.size,
        forceRefresh: options.forceRefresh === true,
      },
      options.logContext,
    );
    return cacheEntry;
  } catch (error) {
    logMemberAuth(
      "warn",
      "approval.refresh_wait_failed",
      {
        error: error instanceof Error ? error.message : String(error),
        forceRefresh: options.forceRefresh === true,
      },
      options.logContext,
    );
    throw error;
  }
}

async function loadApprovedMemberSubjectsFromGoogleSheet(
  googleSheetCsvUrl: string,
  cachedEntry?: ApprovedMemberSheetCacheEntry,
): Promise<ApprovedMemberSheetCacheEntry> {
  const now = Date.now();
  const validatedUrl =
    validateApprovedMemberGoogleSheetCsvUrl(googleSheetCsvUrl);
  const headers = new Headers({
    Accept: "text/csv,text/plain;q=0.9,*/*;q=0.1",
  });

  if (cachedEntry?.eTag) {
    headers.set("If-None-Match", cachedEntry.eTag);
  }

  if (cachedEntry?.lastModified) {
    headers.set("If-Modified-Since", cachedEntry.lastModified);
  }

  const response = await fetch(validatedUrl, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(APPROVED_MEMBER_SHEET_FETCH_TIMEOUT_MS),
  });

  if (response.status === 304 && cachedEntry) {
    return {
      ...cachedEntry,
      expiresAt: now + APPROVED_MEMBER_SHEET_CACHE_MAX_AGE_MS,
    };
  }

  validateApprovedMemberGoogleSheetResponseUrl(response.url);

  if (!response.ok) {
    throw new Error(
      `The approved member Google Sheet returned ${response.status}.`,
    );
  }

  const csvText = await response.text();

  if (csvText.length > APPROVED_MEMBER_SHEET_MAX_RESPONSE_CHARS) {
    throw new Error("The approved member Google Sheet response is too large.");
  }

  return {
    url: googleSheetCsvUrl,
    expiresAt: now + APPROVED_MEMBER_SHEET_CACHE_MAX_AGE_MS,
    subjects: parseApprovedMemberSubjectsCsv(csvText),
    eTag: response.headers.get("etag") || undefined,
    lastModified: response.headers.get("last-modified") || undefined,
  };
}

async function loadApprovedMemberSubjectsFromGoogleSheetWithRetry(
  googleSheetCsvUrl: string,
  cachedEntry?: ApprovedMemberSheetCacheEntry,
): Promise<ApprovedMemberSheetCacheEntry> {
  let lastError: unknown;

  for (
    let attempt = 0;
    attempt <= APPROVED_MEMBER_SHEET_FETCH_RETRY_COUNT;
    attempt += 1
  ) {
    try {
      return await loadApprovedMemberSubjectsFromGoogleSheet(
        googleSheetCsvUrl,
        cachedEntry,
      );
    } catch (error) {
      lastError = error;

      logMemberAuth("warn", "approval.fetch_attempt_failed", {
        attempt: attempt + 1,
        error: error instanceof Error ? error.message : String(error),
      });

      if (attempt === APPROVED_MEMBER_SHEET_FETCH_RETRY_COUNT) {
        break;
      }

      await delay(APPROVED_MEMBER_SHEET_FETCH_RETRY_DELAY_MS);
    }
  }

  throw lastError;
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function validateApprovedMemberGoogleSheetCsvUrl(url: string): URL {
  const validatedUrl = new URL(url);

  if (validatedUrl.protocol !== "https:") {
    throw new Error("The approved member Google Sheet URL must use HTTPS.");
  }

  if (validatedUrl.hostname !== "docs.google.com") {
    throw new Error(
      "The approved member Google Sheet URL must use docs.google.com.",
    );
  }

  if (!validatedUrl.pathname.includes("/spreadsheets/")) {
    throw new Error(
      "The approved member Google Sheet URL must point to a Google Sheet.",
    );
  }

  const isCsvExportUrl =
    validatedUrl.searchParams.get("output") === "csv" ||
    validatedUrl.searchParams.get("format") === "csv";

  if (!isCsvExportUrl) {
    throw new Error(
      "The approved member Google Sheet URL must be a CSV export link.",
    );
  }

  return validatedUrl;
}

function validateApprovedMemberGoogleSheetResponseUrl(url: string): void {
  const responseUrl = new URL(url);
  const isAllowedHost =
    responseUrl.hostname === "docs.google.com" ||
    responseUrl.hostname.endsWith(".googleusercontent.com");

  if (responseUrl.protocol !== "https:" || !isAllowedHost) {
    throw new Error(
      "The approved member Google Sheet redirected to an unexpected host.",
    );
  }
}

function parseApprovedMemberSubjectsCsv(csvText: string): ReadonlySet<string> {
  return new Set(
    csvText
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((line) => parseFirstCsvValue(line).trim())
      .filter(Boolean)
      .filter(
        (value, index) =>
          !(
            index === 0 &&
            [
              "approval id",
              "id",
              "pairwise_sub",
              "pairwise sub",
              "shoo id",
              "user id",
            ].includes(value.toLowerCase())
          ),
      ),
  );
}

function parseFirstCsvValue(line: string): string {
  let value = "";
  let inQuotes = false;
  let charIndex = 0;

  while (charIndex < line.length) {
    const char = line[charIndex];

    if (char === '"') {
      if (inQuotes && line[charIndex + 1] === '"') {
        value += '"';
        charIndex += 2;
        continue;
      }

      inQuotes = !inQuotes;
    } else if (!inQuotes && char === ",") {
      return value;
    } else {
      value += char;
    }

    charIndex += 1;
  }

  return value;
}

export function getShooAudienceOriginsForRequest(request: Request): string[] {
  const origins = new Set<string>();
  const requestUrl = new URL(request.url);
  const addOrigin = (value?: string | null) => {
    if (!value) {
      return;
    }

    try {
      origins.add(new URL(value).origin);
    } catch {
      // Ignore invalid origin candidates from headers.
    }
  };

  addOrigin(requestUrl.origin);
  addOrigin(getVercelDeploymentOrigin());

  return Array.from(origins);
}

function getVercelDeploymentOrigin(): string | undefined {
  const vercelUrl = process?.env?.VERCEL_URL?.trim();

  if (!vercelUrl) {
    return undefined;
  }

  return `https://${vercelUrl}`;
}

export async function checkMemberAuth(request: Request): Promise<boolean> {
  return (await getAuthorizedMemberSession(request)) !== null;
}

export async function setMemberAuthCookie(
  session: {
    pairwiseSub: string;
    legacyIdToken: string;
  },
  request: Request,
): Promise<string> {
  const cookieValue =
    (await createMemberSessionCookieValue(session.pairwiseSub, request)) ||
    session.legacyIdToken;
  const attributes = [
    `${MEMBER_SESSION_COOKIE}=${encodeURIComponent(cookieValue)}`,
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

async function createMemberSessionCookieValue(
  pairwiseSub: string,
  request: Request,
): Promise<string | null> {
  const secret = getMemberSessionSecret();

  if (!secret) {
    return null;
  }

  return new SignJWT({
    approved: true,
    pairwise_sub: pairwiseSub,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(getMemberSessionIssuer(request))
    .setSubject(pairwiseSub)
    .setIssuedAt()
    .setExpirationTime(`${MEMBER_SESSION_MAX_AGE_SECONDS}s`)
    .sign(secret);
}

async function verifyMemberSessionCookie(
  token: string,
  request: Request,
): Promise<AuthorizedMemberSession | null> {
  const secret = getMemberSessionSecret();

  if (!secret) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: getMemberSessionIssuer(request),
    });

    if (payload.approved !== true || typeof payload.pairwise_sub !== "string") {
      return null;
    }

    return {
      pairwise_sub: payload.pairwise_sub,
    };
  } catch {
    return null;
  }
}

function getMemberSessionSecret(): Uint8Array | null {
  const secret =
    (typeof process !== "undefined" && process.env?.MEMBER_SESSION_SECRET) ||
    import.meta.env.MEMBER_SESSION_SECRET;

  if (!secret) {
    return null;
  }

  return new TextEncoder().encode(secret);
}

export function createMemberAuthLogContext(
  request: Request,
  route?: string,
): MemberAuthLogContext {
  return {
    requestId:
      request.headers.get("x-vercel-id") ||
      request.headers.get("x-request-id") ||
      crypto.randomUUID(),
    route,
  };
}

export function logMemberAuth(
  level: "debug" | "info" | "warn" | "error",
  event: string,
  details: Record<string, unknown> = {},
  context?: MemberAuthLogContext,
): void {
  if (!shouldLogMemberAuth(level)) {
    return;
  }

  const logger = console[level] ?? console.log;
  logger("[member-auth]", {
    level,
    event,
    ...context,
    ...details,
    timestamp: new Date().toISOString(),
  });
}

function shouldLogMemberAuth(
  level: "debug" | "info" | "warn" | "error",
): boolean {
  if (level === "warn" || level === "error") {
    return true;
  }

  const debugFlag =
    (typeof process !== "undefined" && process.env?.MEMBER_AUTH_DEBUG) ||
    import.meta.env.MEMBER_AUTH_DEBUG;

  return debugFlag === "true";
}

function redactMemberUserId(userId: string): string {
  if (userId.length <= 8) {
    return "***";
  }

  return `${userId.slice(0, 4)}...${userId.slice(-4)}`;
}

function getMemberSessionIssuer(request: Request): string {
  return `${MEMBER_SESSION_ISSUER}:${new URL(request.url).origin}`;
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
