import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";

export default defineConfig({
  output: "server",
  adapter: vercel({
    imageService: true,
    webAnalytics: {
      enabled: true,
    },
  }),
  integrations: [mdx(), react()],
  security: {
    /**
     * Vercel terminates TLS at the edge and forwards the real host in
     * `x-forwarded-host`. Astro only trusts that header for hosts listed here —
     * with an empty list it falls back to `localhost`, which makes `Astro.url`
     * wrong on every request and makes its own CSRF check reject any form POST,
     * because the browser's `Origin` can never equal `https://localhost`.
     */
    allowedDomains: [
      { hostname: "gmhsminithon.org", protocol: "https" },
      { hostname: "**.gmhsminithon.org", protocol: "https" },
      // Deployment, branch, and preview aliases.
      { hostname: "**.vercel.app", protocol: "https" },
      { hostname: "localhost", protocol: "http" },
    ],
  },
});
