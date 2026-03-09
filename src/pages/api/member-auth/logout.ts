import type { APIRoute } from "astro";
import {
  MEMBER_LOGIN_PATH,
  clearMemberAuthCookie,
} from "../../../utils/auth";

export const POST: APIRoute = async ({ request }) => {
  const returnTo = await getSafeReturnToPath(request);

  return new Response(null, {
    status: 303,
    headers: {
      Location: returnTo,
      "Set-Cookie": clearMemberAuthCookie(request),
    },
  });
};

async function getSafeReturnToPath(request: Request): Promise<string> {
  const fallbackPath = MEMBER_LOGIN_PATH;
  const contentType = request.headers.get("content-type") || "";

  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return fallbackPath;
  }

  try {
    const formData = await request.formData();
    const returnTo = formData.get("returnTo");

    if (typeof returnTo !== "string" || !returnTo.startsWith("/")) {
      return fallbackPath;
    }

    return returnTo.startsWith("//") ? fallbackPath : returnTo;
  } catch {
    return fallbackPath;
  }
}
