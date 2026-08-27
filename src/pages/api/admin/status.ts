import type { APIRoute } from "astro";
import { getAdminSetupStatus } from "../../../utils/admin/setup";

/**
 * Unauthenticated on purpose: it is the only way to check whether a deployment
 * picked up its environment variables when nobody can sign in yet. It reports
 * counts and booleans only — no secrets, no connection strings, no Shoo IDs.
 */
export const GET: APIRoute = async ({ request }) => {
  return new Response(JSON.stringify(getAdminSetupStatus(request), null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
};
