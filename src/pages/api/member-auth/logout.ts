import type { APIRoute } from "astro";
import { clearMemberAuthCookie } from "../../../utils/auth";

export const POST: APIRoute = async ({ request }) =>
  new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": clearMemberAuthCookie(request),
    },
  });
