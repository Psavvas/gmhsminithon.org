import type { APIRoute } from "astro";
import {
  clearMemberAuthCookie,
  isApprovedMemberEmail,
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
    const payload = await verifyShooToken(idToken, request.url);

    if (payload.email_verified === false) {
      return jsonResponse(
        {
          error: "Your Shoo account email must be verified before continuing.",
        },
        403,
        request,
      );
    }

    if (!isApprovedMemberEmail(payload.email)) {
      return jsonResponse(
        {
          error:
            "Your verified account is not on the approved member list yet.",
        },
        403,
        request,
      );
    }

    return new Response(
      JSON.stringify({
        userId: payload.pairwise_sub,
        email: payload.email ?? null,
        name: typeof payload.name === "string" ? payload.name : null,
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
