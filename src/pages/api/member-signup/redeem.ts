import type { APIRoute } from "astro";
import {
  clearMemberAuthCookie,
  createMemberAuthLogContext,
  getShooAudienceOriginsForRequest,
  logMemberAuth,
  setMemberAuthCookie,
  verifyShooToken,
} from "../../../utils/auth";
import { redeemSignupCode } from "../../../utils/memberSignup";

export const POST: APIRoute = async ({ request }) => {
  const logContext = createMemberAuthLogContext(
    request,
    "api/member-signup/redeem",
  );
  let idToken = "";
  let accessCode: unknown = "";

  try {
    const body = await request.json();
    idToken = typeof body?.idToken === "string" ? body.idToken : "";
    accessCode = body?.accessCode;
  } catch {
    return jsonResponse({ error: "Invalid request body." }, 400, request);
  }

  if (!idToken) {
    logMemberAuth("warn", "signup.request_missing_id_token", {}, logContext);
    return jsonResponse({ error: "Missing idToken." }, 400, request);
  }

  // Sign in first, then check the code. Guessing the code therefore costs a
  // real Shoo account, and every guess is attributable to one.
  let pairwiseSub = "";

  try {
    const payload = await verifyShooToken(
      idToken,
      getShooAudienceOriginsForRequest(request),
    );
    pairwiseSub = payload.pairwise_sub;
  } catch (error) {
    logMemberAuth(
      "warn",
      "signup.token_verification_failed",
      { error: error instanceof Error ? error.message : String(error) },
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

  const redemption = await redeemSignupCode(
    { pairwiseSub, accessCode },
    logContext,
  );

  if (!redemption.ok) {
    return jsonResponse(
      { error: redemption.error, userId: pairwiseSub },
      redemption.status,
      request,
    );
  }

  const sessionCookie = await setMemberAuthCookie(
    { pairwiseSub, legacyIdToken: idToken },
    request,
  );

  return new Response(
    JSON.stringify({ userId: pairwiseSub, status: redemption.status }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": sessionCookie,
      },
    },
  );
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
