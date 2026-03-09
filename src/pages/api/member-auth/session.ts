import type { APIRoute } from "astro";
import {
  clearMemberAuthCookie,
  getShooAudienceOriginsForRequest,
  hasApprovedMemberSubjects,
  isApprovedMemberSubject,
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

    if (!hasApprovedMemberSubjects()) {
      return jsonResponse(
        {
          error:
            "Member access is not configured yet. Ask an admin to add approved Shoo IDs on the server.",
          approvalId: payload.pairwise_sub,
        },
        503,
        request,
      );
    }

    if (!isApprovedMemberSubject(payload.pairwise_sub)) {
      return jsonResponse(
        {
          error:
            "Your Shoo account is authenticated, but it has not been approved for the members portal yet.",
          approvalId: payload.pairwise_sub,
        },
        403,
        request,
      );
    }

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
  payload: Record<string, string>,
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
