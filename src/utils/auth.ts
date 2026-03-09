import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const DEFAULT_SHOO_BASE_URL = "https://shoo.dev";
const MEMBER_SESSION_COOKIE = "member_session";
export const MEMBER_LOGIN_PATH = "/members/login";
export const MEMBER_HOME_PATH = "/members";
export const MEMBER_AUTH_CALLBACK_PATH = "/members/auth/callback";
const MEMBER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;
const APPROVED_MEMBER_SHEET_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const APPROVED_MEMBER_SHEET_MAX_RESPONSE_CHARS = 100_000;
const SHOO_BASE_URL =
  import.meta.env.PUBLIC_SHOO_BASE_URL || DEFAULT_SHOO_BASE_URL;
const SHOO_ISSUER = SHOO_BASE_URL;
const shooJwks = createRemoteJWKSet(
  new URL("/.well-known/jwks.json", SHOO_BASE_URL),
);
let approvedMemberSheetCache:
  | {
      url: string;
      expiresAt: number;
      subjects: ReadonlySet<string>;
    }
  | undefined;
let approvedMemberSheetFetchPromise: Promise<ReadonlySet<string>> | undefined;

type ShooVerifiedToken = JWTPayload & {
  pairwise_sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

type ApprovedMemberSubjectsState = {
  isConfigured: boolean;
  loadError?: string;
  subjects: ReadonlySet<string>;
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
): Promise<ShooVerifiedToken | null> {
  const token = getMemberTokenFromRequest(request);

  if (!token) {
    return null;
  }

  try {
    const payload = await verifyShooToken(
      token,
      getShooAudienceOriginsForRequest(request),
    );
    const approvedMemberSubjectsState = await getApprovedMemberSubjectsState();

    if (!approvedMemberSubjectsState.subjects.has(payload.pairwise_sub)) {
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

export async function getApprovedMemberSubjectsState(): Promise<ApprovedMemberSubjectsState> {
  const envSubjects = parseApprovedMemberSubjects(getMemberApprovedShooSubsEnv());
  const googleSheetCsvUrl = getMemberApprovedGoogleSheetCsvUrl();
  const subjects = new Set(envSubjects);
  let loadError: string | undefined;

  if (googleSheetCsvUrl) {
    try {
      for (const subject of await getApprovedMemberSubjectsFromGoogleSheet(
        googleSheetCsvUrl,
      )) {
        subjects.add(subject);
      }
    } catch (error) {
      loadError =
        error instanceof Error
          ? error.message
          : "The approved member Google Sheet could not be loaded.";
    }
  }

  return {
    isConfigured: envSubjects.size > 0 || Boolean(googleSheetCsvUrl),
    loadError,
    subjects,
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
): Promise<ReadonlySet<string>> {
  const now = Date.now();

  if (
    approvedMemberSheetCache?.url === googleSheetCsvUrl &&
    approvedMemberSheetCache.expiresAt > now
  ) {
    return approvedMemberSheetCache.subjects;
  }

  if (!approvedMemberSheetFetchPromise) {
    approvedMemberSheetFetchPromise = loadApprovedMemberSubjectsFromGoogleSheet(
      googleSheetCsvUrl,
    ).finally(() => {
      approvedMemberSheetFetchPromise = undefined;
    });
  }

  const subjects = await approvedMemberSheetFetchPromise;
  approvedMemberSheetCache = {
    url: googleSheetCsvUrl,
    expiresAt: now + APPROVED_MEMBER_SHEET_CACHE_MAX_AGE_MS,
    subjects,
  };
  return subjects;
}

async function loadApprovedMemberSubjectsFromGoogleSheet(
  googleSheetCsvUrl: string,
): Promise<ReadonlySet<string>> {
  const validatedUrl = validateApprovedMemberGoogleSheetCsvUrl(googleSheetCsvUrl);
  const response = await fetch(validatedUrl, {
    headers: {
      Accept: "text/csv,text/plain;q=0.9,*/*;q=0.1",
    },
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(
      `The approved member Google Sheet returned ${response.status}.`,
    );
  }

  const csvText = await response.text();

  if (csvText.length > APPROVED_MEMBER_SHEET_MAX_RESPONSE_CHARS) {
    throw new Error("The approved member Google Sheet response is too large.");
  }

  return parseApprovedMemberSubjectsCsv(csvText);
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
    const character = line[charIndex];

    if (character === '"') {
      if (inQuotes && line[charIndex + 1] === '"') {
        value += '"';
        charIndex += 2;
        continue;
      }

      inQuotes = !inQuotes;
    } else if (!inQuotes && character === ",") {
      return value;
    } else {
      value += character;
    }

    charIndex += 1;
  }

  return value;
}

export function getShooAudienceOriginsForRequest(request: Request): string[] {
  const origins = new Set<string>();
  const requestUrl = new URL(request.url);
  const requestOrigin = requestUrl.origin;
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

  addOrigin(request.headers.get("origin"));
  addOrigin(requestOrigin);
  addOrigin(getVercelDeploymentOrigin());

  return Array.from(origins);
}

function getVercelDeploymentOrigin(): string | undefined {
  const vercelUrl = process.env.VERCEL_URL?.trim();

  if (!vercelUrl) {
    return undefined;
  }

  return `https://${vercelUrl}`;
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
