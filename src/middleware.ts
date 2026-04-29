import { defineMiddleware } from "astro:middleware";

const ALLOWED_PREFIXES = ["/coming-soon", "/redirect/", "/_astro/", "/api/"];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  const isAllowed = ALLOWED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (!isAllowed) {
    return context.redirect("/coming-soon", 302);
  }

  return next();
});
