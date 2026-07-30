import type { APIRoute } from "astro";
import {
  getShooAudienceOriginsForRequest,
  verifyShooToken,
} from "../../../utils/auth";
import {
  getAccessListState,
  isAdminSubject,
} from "../../../utils/admin/access";
import {
  clearAdminSessionCookie,
  createAdminSessionCookie,
  isAdminSessionConfigured,
  jsonError,
  logAdmin,
  redactShooSub,
} from "../../../utils/admin/session";

export const POST: APIRoute = async ({ request }) => {
  let idToken = "";

  try {
    const body = await request.json();
    idToken = typeof body?.idToken === "string" ? body.idToken : "";
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  if (!idToken) {
    return jsonError("Missing idToken.", 400);
  }

  if (!isAdminSessionConfigured()) {
    return jsonError(
      "The admin portal needs ADMIN_SESSION_SECRET (or MEMBER_SESSION_SECRET) set in Vercel before it can sign anyone in.",
      503,
    );
  }

  let pairwiseSub: string;

  try {
    const payload = await verifyShooToken(
      idToken,
      getShooAudienceOriginsForRequest(request),
    );
    pairwiseSub = payload.pairwise_sub;
  } catch (error) {
    logAdmin("warn", "session.shoo_verification_failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return failure(
      error instanceof Error
        ? error.message
        : "Shoo sign-in could not be verified.",
      401,
      request,
    );
  }

  let allowed = await isAdminSubject(pairwiseSub);

  if (!allowed) {
    // The ID may have been added moments ago on another instance.
    const refreshed = await getAccessListState("admins", {
      forceRefresh: true,
    });
    allowed = refreshed.subjects.has(pairwiseSub);

    if (!allowed && refreshed.error) {
      logAdmin("warn", "session.admin_list_unavailable", {
        error: refreshed.error,
      });

      return failure(
        "The admin list could not be loaded right now. Please try again in a moment.",
        503,
        request,
        pairwiseSub,
      );
    }
  }

  if (!allowed) {
    logAdmin("warn", "session.not_an_admin", {
      userId: redactShooSub(pairwiseSub),
    });

    return failure(
      "Your Shoo account is signed in, but it is not on the admin list yet.",
      403,
      request,
      pairwiseSub,
    );
  }

  const cookie = await createAdminSessionCookie(pairwiseSub, request);

  if (!cookie) {
    return jsonError(
      "The admin portal could not create a session. Check ADMIN_SESSION_SECRET in Vercel.",
      503,
    );
  }

  logAdmin("info", "session.created", {
    userId: redactShooSub(pairwiseSub),
  });

  return new Response(JSON.stringify({ userId: pairwiseSub }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Set-Cookie": cookie,
    },
  });
};

function failure(
  message: string,
  status: number,
  request: Request,
  userId?: string,
): Response {
  return new Response(JSON.stringify({ error: message, userId }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Set-Cookie": clearAdminSessionCookie(request),
    },
  });
}
