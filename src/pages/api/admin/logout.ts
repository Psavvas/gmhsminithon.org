import type { APIRoute } from "astro";
import {
  ADMIN_LOGIN_PATH,
  clearAdminSessionCookie,
  getAdminSession,
  logAdmin,
  redactShooSub,
} from "../../../utils/admin/session";

export const GET: APIRoute = async ({ request }) => signOut(request);

export const POST: APIRoute = async ({ request }) => signOut(request);

async function signOut(request: Request): Promise<Response> {
  const session = await getAdminSession(request);

  if (session) {
    logAdmin("info", "session.signed_out", {
      userId: redactShooSub(session.pairwiseSub),
    });
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: getSafeReturnTo(request),
      "Set-Cookie": clearAdminSessionCookie(request),
      "Cache-Control": "no-store",
    },
  });
}

function getSafeReturnTo(request: Request): string {
  try {
    const returnTo = new URL(request.url).searchParams.get("returnTo");

    if (
      typeof returnTo === "string" &&
      returnTo.startsWith("/") &&
      !returnTo.startsWith("//")
    ) {
      return returnTo;
    }
  } catch {
    // Fall through to the default below.
  }

  return `${ADMIN_LOGIN_PATH}?signedOut=1`;
}
