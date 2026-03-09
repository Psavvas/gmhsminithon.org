import type { APIRoute } from "astro";
import {
  clearMemberAuthCookie,
  getShooAudienceOriginsForRequest,
  getApprovedMemberSubjectsState,
  setMemberAuthCookie,
  verifyShooToken,
} from "../../../utils/auth";

export const POST: APIRoute = async ({ request }) => {
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
    const approvedMemberSubjectsState = await getApprovedMemberSubjectsState();

    if (!approvedMemberSubjectsState.isConfigured) {
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

    if (approvedMemberSubjectsState.subjects.has(payload.pairwise_sub)) {
      return new Response(
        JSON.stringify({
          userId: payload.pairwise_sub,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": setMemberAuthCookie(idToken, request),
          },
        },
      );
    }

    const refreshedApprovedMemberSubjectsState =
      await getApprovedMemberSubjectsState({
        forceRefresh: true,
      });

    if (refreshedApprovedMemberSubjectsState.subjects.has(payload.pairwise_sub)) {
      return new Response(
        JSON.stringify({
          userId: payload.pairwise_sub,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": setMemberAuthCookie(idToken, request),
          },
        },
      );
    }

    if (
      approvedMemberSubjectsState.loadError ||
      refreshedApprovedMemberSubjectsState.loadError
    ) {
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
