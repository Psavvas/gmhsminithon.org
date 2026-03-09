/// <reference types="astro/client" />
/// <reference types="astro/client-image" />

declare const process:
  | {
      env?: Record<string, string | undefined>;
    }
  | undefined;

interface ImportMetaEnv {
  readonly MEMBER_APPROVED_SHOO_SUBS?: string;
  readonly MEMBER_AUTH_DEBUG?: string;
  readonly MEMBER_APPROVED_SHOO_SUBS_GOOGLE_SHEET_CSV_URL?: string;
  readonly MEMBER_SESSION_SECRET?: string;
  readonly PUBLIC_VERCEL_ANALYTICS_ID: string;
  readonly PUBLIC_SHOO_BASE_URL?: string;
  readonly EMAIL_OCTOPUS_API_KEY: string;
  readonly EMAIL_OCTOPUS_LIST_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
