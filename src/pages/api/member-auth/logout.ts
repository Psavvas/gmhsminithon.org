import type { APIRoute } from "astro";
import {
  MEMBER_LOGIN_PATH,
  clearMemberAuthCookie,
} from "../../../utils/auth";

export const GET: APIRoute = async ({ request }) => {
  const returnTo = getSafeReturnToPath(request);

  return createLogoutResponse(request, returnTo);
};

export const POST: APIRoute = async ({ request }) => {
  const returnTo = await getSafeReturnToPathFromPost(request);

  return createLogoutResponse(request, returnTo);
};

function createLogoutResponse(request: Request, returnTo: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: returnTo,
      "Set-Cookie": clearMemberAuthCookie(request),
    },
  });
}

function getSafeReturnToPath(request: Request): string {
  const fallbackPath = MEMBER_LOGIN_PATH;

  try {
    const returnTo = new URL(request.url).searchParams.get("returnTo");

    return sanitizeReturnTo(returnTo, fallbackPath);
  } catch {
    return fallbackPath;
  }
}

async function getSafeReturnToPathFromPost(request: Request): Promise<string> {
  const fallbackPath = MEMBER_LOGIN_PATH;
  const contentType = request.headers.get("content-type") || "";

  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return getSafeReturnToPath(request);
  }

  try {
    const formData = await request.formData();
    const returnTo = formData.get("returnTo");

    return sanitizeReturnTo(returnTo, fallbackPath);
  } catch {
    return fallbackPath;
  }
}

function sanitizeReturnTo(returnTo: FormDataEntryValue | string | null, fallbackPath: string): string {
  if (typeof returnTo !== "string" || !returnTo.startsWith("/")) {
    return fallbackPath;
  }

  return returnTo.startsWith("//") ? fallbackPath : returnTo;
}
