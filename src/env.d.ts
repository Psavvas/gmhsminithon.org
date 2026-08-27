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
  readonly PUBLIC_SITE_URL?: string;
  readonly EMAIL_OCTOPUS_API_KEY: string;
  readonly EMAIL_OCTOPUS_LIST_ID: string;
  /** Admin portal: Shoo user IDs that always have admin access. */
  readonly ADMIN_APPROVED_SHOO_SUBS?: string;
  /** Admin portal: secret for signing admin session cookies. */
  readonly ADMIN_SESSION_SECRET?: string;
  readonly ADMIN_AUTH_DEBUG?: string;
  /** Neon Postgres connection string backing the admin portal. */
  readonly DATABASE_URL?: string;
  readonly CONTENT_DATABASE_URL?: string;
  readonly NEON_DATABASE_URL?: string;
  readonly POSTGRES_URL?: string;
  readonly DATABASE_URL_UNPOOLED?: string;
  readonly POSTGRES_URL_NON_POOLING?: string;
  /** UploadThing token used for admin image uploads. */
  readonly UPLOADTHING_TOKEN?: string;
  readonly UPLOADTHING_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
