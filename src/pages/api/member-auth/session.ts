import type { APIRoute } from "astro";
import {
  createMemberAuthLogContext,
  clearMemberAuthCookie,
  getShooAudienceOriginsForRequest,
  getApprovedMemberSubjectsState,
  logMemberAuth,
  setMemberAuthCookie,
  verifyShooToken,
} from "../../../utils/auth";

export const POST: APIRoute = async ({ request }) => {
  const logContext = createMemberAuthLogContext(
    request,
    "api/member-auth/session",
  );
  let idToken = "";

  try {
    const body = await request.json();
    idToken = typeof body?.idToken === "string" ? body.idToken : "";
  } catch {
    return jsonResponse(
      {
        error: "Invalid request body.",
      },
      400,
      request,
    );
  }

  if (!idToken) {
    logMemberAuth("warn", "session.request_missing_id_token", {}, logContext);
    return jsonResponse(
      {
        error: "Missing idToken.",
      },
      400,
      request,
    );
  }

  try {
    const payload = await verifyShooToken(
      idToken,
      getShooAudienceOriginsForRequest(request),
    );
    logMemberAuth(
      "info",
      "session.token_verified",
      {
        userId: `${payload.pairwise_sub.slice(0, 4)}...${payload.pairwise_sub.slice(-4)}`,
      },
      logContext,
    );
    const approvedMemberSubjectsState = await getApprovedMemberSubjectsState({
      logContext,
    });

    if (!approvedMemberSubjectsState.isConfigured) {
      logMemberAuth("warn", "session.approval_not_configured", {}, logContext);
      return jsonResponse(
        {
          error:
            "Member access is not configured yet. Ask an admin to add approved Shoo IDs on the server.",
          userId: payload.pairwise_sub,
        },
        503,
        request,
      );
    }

    if (approvedMemberSubjectsState.loadError) {
      logMemberAuth(
        "warn",
        "session.approval_load_error",
        {
          error: approvedMemberSubjectsState.loadError,
          cacheStatus: approvedMemberSubjectsState.cacheStatus,
        },
        logContext,
      );
      return jsonResponse(
        {
          error:
            "We verified your Shoo sign-in, but the approved member list could not be loaded right now. Please try again later or ask an admin to check the Google Sheet configuration.",
          userId: payload.pairwise_sub,
        },
        503,
        request,
      );
    }

    if (approvedMemberSubjectsState.subjects.has(payload.pairwise_sub)) {
      logMemberAuth("info", "session.approved_from_cache", {}, logContext);
      const sessionCookie = await setMemberAuthCookie(
        {
          pairwiseSub: payload.pairwise_sub,
          legacyIdToken: idToken,
        },
        request,
      );

      return new Response(
        JSON.stringify({
          userId: payload.pairwise_sub,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": sessionCookie,
          },
        },
      );
    }

    const refreshedApprovedMemberSubjectsState =
      await getApprovedMemberSubjectsState({
        forceRefresh: true,
        waitForRefresh: true,
        logContext,
      });

    if (refreshedApprovedMemberSubjectsState.loadError) {
      logMemberAuth(
        "warn",
        "session.approval_load_error_after_refresh",
        {
          error: refreshedApprovedMemberSubjectsState.loadError,
        },
        logContext,
      );
      return jsonResponse(
        {
          error:
            "We verified your Shoo sign-in, but the approved member list could not be loaded right now. Please try again later or ask an admin to check the Google Sheet configuration.",
          userId: payload.pairwise_sub,
        },
        503,
        request,
      );
    }

    if (
      refreshedApprovedMemberSubjectsState.subjects.has(payload.pairwise_sub)
    ) {
      logMemberAuth("info", "session.approved_after_refresh", {}, logContext);
      const sessionCookie = await setMemberAuthCookie(
        {
          pairwiseSub: payload.pairwise_sub,
          legacyIdToken: idToken,
        },
        request,
      );

      return new Response(
        JSON.stringify({
          userId: payload.pairwise_sub,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": sessionCookie,
          },
        },
      );
    }

    return jsonResponse(
      {
        error:
          "Your Shoo account is authenticated, but it has not been approved for the members portal yet.",
        userId: payload.pairwise_sub,
      },
      403,
      request,
    );
  } catch (error) {
    logMemberAuth(
      "warn",
      "session.request_failed",
      {
        error: error instanceof Error ? error.message : String(error),
      },
      logContext,
    );
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Shoo token verification failed.",
      },
      401,
      request,
    );
  }
};

function jsonResponse(
  payload: Record<string, string | undefined>,
  status: number,
  request: Request,
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearMemberAuthCookie(request),
    },
  });
}
