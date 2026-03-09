/// <reference types="astro/client" />
/// <reference types="astro/client-image" />

interface ImportMetaEnv {
  readonly PUBLIC_VERCEL_ANALYTICS_ID: string;
  readonly EMAIL_OCTOPUS_API_KEY: string;
  readonly EMAIL_OCTOPUS_LIST_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
