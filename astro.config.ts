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
});
