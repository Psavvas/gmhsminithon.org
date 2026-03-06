import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import mdx from "@astrojs/mdx";

export default defineConfig({
  output: "server",
  security: {
    checkOrigin: false,
  },
  adapter: vercel({
    imageService: true,
    webAnalytics: {
      enabled: true,
    },
  }),
  integrations: [mdx()],
});
