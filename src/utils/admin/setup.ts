/**
 * A read-only view of how this deployment is configured, used by the admin
 * sign-in page and `GET /api/admin/status` to answer "did my environment
 * variables actually reach this deployment?".
 *
 * Deliberately env-only: it never queries the database and never reveals a
 * secret, a connection string, or a Shoo user ID — just counts and booleans.
 */
import { readEnv } from "../env";
import {
  getPublicSiteUrl,
  getShooAudienceOriginsForRequest,
  getShooBaseUrl,
  getVercelBranchOrigin,
  getVercelDeploymentOrigin,
  getVercelProductionOrigin,
} from "../auth";
import { isDatabaseConfigured } from "../content/db";
import { isUploadThingConfigured } from "./uploads";
import { parseShooSubList } from "./access";
import { isAdminSessionConfigured } from "./session";

/**
 * Shoo identifies a site by its origin (`client_id` is `origin:<origin>`), and
 * a user's `pairwise_sub` is per-client. A Shoo user ID is therefore tied to the
 * exact URL it was issued on: the same person has a different ID on
 * `example.com` than on a `*.vercel.app` deployment URL. Signing in somewhere
 * whose URL changes on every deploy means a new ID every deploy, so this works
 * out where the stable URL is.
 */
export type SignInOriginInfo = {
  currentOrigin: string;
  /** True when this URL is replaced on the next deploy. */
  isPerDeploymentUrl: boolean;
  /** The best URL to use instead, or null when the current one is stable. */
  recommendedOrigin: string | null;
  /** Every stable URL this deployment knows about. */
  stableOrigins: string[];
};

export type AdminSetupStatus = {
  adminSessionSecretConfigured: boolean;
  adminIdsFromEnv: number;
  memberIdsFromEnv: number;
  memberSheetConfigured: boolean;
  databaseConfigured: boolean;
  uploadsConfigured: boolean;
  shooBaseUrl: string;
  requestOrigin: string;
  acceptedTokenOrigins: string[];
  publicSiteUrl: string | null;
  signInOrigin: SignInOriginInfo;
};

function toOrigin(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

export function getSignInOriginInfo(request: Request): SignInOriginInfo {
  const currentOrigin = new URL(request.url).origin;
  const deploymentOrigin = toOrigin(getVercelDeploymentOrigin());
  const isPreview = readEnv("VERCEL_ENV") === "preview";

  // On a preview the branch alias is the natural home; on production it is the
  // site's own domain.
  const preference = isPreview
    ? [getVercelBranchOrigin(), getPublicSiteUrl(), getVercelProductionOrigin()]
    : [
        getPublicSiteUrl(),
        getVercelProductionOrigin(),
        getVercelBranchOrigin(),
      ];

  const stableOrigins = Array.from(
    new Set(
      preference
        .map(toOrigin)
        .filter((origin): origin is string => Boolean(origin))
        // The per-deployment URL is never a stable choice.
        .filter((origin) => origin !== deploymentOrigin),
    ),
  );

  const isPerDeploymentUrl = Boolean(
    deploymentOrigin &&
    currentOrigin === deploymentOrigin &&
    stableOrigins.length > 0,
  );

  return {
    currentOrigin,
    isPerDeploymentUrl,
    recommendedOrigin: isPerDeploymentUrl ? stableOrigins[0] : null,
    stableOrigins,
  };
}

export function getAdminSetupStatus(request: Request): AdminSetupStatus {
  return {
    signInOrigin: getSignInOriginInfo(request),
    adminSessionSecretConfigured: isAdminSessionConfigured(),
    adminIdsFromEnv: parseShooSubList(readEnv("ADMIN_APPROVED_SHOO_SUBS"))
      .length,
    memberIdsFromEnv: parseShooSubList(readEnv("MEMBER_APPROVED_SHOO_SUBS"))
      .length,
    memberSheetConfigured: Boolean(
      readEnv("MEMBER_APPROVED_SHOO_SUBS_GOOGLE_SHEET_CSV_URL"),
    ),
    databaseConfigured: isDatabaseConfigured(),
    uploadsConfigured: isUploadThingConfigured(),
    shooBaseUrl: getShooBaseUrl(),
    requestOrigin: new URL(request.url).origin,
    acceptedTokenOrigins: getShooAudienceOriginsForRequest(request),
    publicSiteUrl: readEnv("PUBLIC_SITE_URL") ?? null,
  };
}

export type SetupCheck = {
  label: string;
  ok: boolean;
  detail: string;
  /** Critical checks block sign-in; the rest are optional features. */
  critical: boolean;
};

/**
 * The same status, phrased as things to fix.
 */
export function describeAdminSetup(status: AdminSetupStatus): SetupCheck[] {
  return [
    {
      label: "ADMIN_SESSION_SECRET",
      critical: true,
      ok: status.adminSessionSecretConfigured,
      detail: status.adminSessionSecretConfigured
        ? "Set, so admin sessions can be signed."
        : "Missing or shorter than 16 characters. Nobody can sign in until this is set (MEMBER_SESSION_SECRET is used as a fallback).",
    },
    {
      label: "ADMIN_APPROVED_SHOO_SUBS",
      critical: true,
      ok: status.adminIdsFromEnv > 0,
      detail:
        status.adminIdsFromEnv > 0
          ? `${status.adminIdsFromEnv} Shoo ID${status.adminIdsFromEnv === 1 ? "" : "s"} found on this deployment.`
          : "No IDs found on this deployment. If you added it in Vercel, redeploy so the change is picked up — and check it was added for the environment you are visiting (Production vs Preview).",
    },
    {
      label: "Member portal access",
      critical: true,
      ok:
        status.adminIdsFromEnv > 0 ||
        status.memberIdsFromEnv > 0 ||
        status.memberSheetConfigured ||
        status.databaseConfigured,
      detail:
        status.memberIdsFromEnv > 0 || status.memberSheetConfigured
          ? "Member IDs are configured."
          : status.adminIdsFromEnv > 0
            ? "No member-specific IDs are set, but admins can use the member portal too."
            : "No member approval source is configured yet.",
    },
    {
      label: "Sign-in URL",
      critical: true,
      ok: !status.signInOrigin.isPerDeploymentUrl,
      detail: status.signInOrigin.isPerDeploymentUrl
        ? `This address is replaced on every deploy, and Shoo issues a different user ID per address. Sign in at ${status.signInOrigin.recommendedOrigin} instead.`
        : "This address is stable, so your Shoo user ID stays the same here.",
    },
    {
      label: "Neon database",
      critical: false,
      ok: status.databaseConfigured,
      detail: status.databaseConfigured
        ? "A connection string is set, so content can be saved."
        : "Not set. The site serves the JSON files in the repository and the portal is read-only.",
    },
    {
      label: "UPLOADTHING_TOKEN",
      critical: false,
      ok: status.uploadsConfigured,
      detail: status.uploadsConfigured
        ? "Set, so images can be uploaded."
        : "Not set. Image links can still be pasted by hand.",
    },
  ];
}
