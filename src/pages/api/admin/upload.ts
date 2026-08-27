import type { APIRoute } from "astro";
import { MAX_UPLOAD_BYTES, uploadImage } from "../../../utils/admin/uploads";
import { logAdminActivity } from "../../../utils/content/db";
import {
  guardAdminApiRequest,
  jsonError,
  jsonResponse,
  logAdmin,
  redactShooSub,
} from "../../../utils/admin/session";

/**
 * Header values are latin-1, so the browser sends the name URI-encoded.
 * `uploadImage` sanitises whatever comes back, so this only has to not throw.
 */
function decodeFileName(header: string | null): string {
  if (!header) {
    return "upload";
  }

  try {
    return decodeURIComponent(header) || "upload";
  } catch {
    return header;
  }
}

/**
 * The image arrives as a raw body rather than a multipart form, with its name
 * in a header. Astro's built-in CSRF middleware only guards form-like content
 * types, and it compares the browser's `Origin` against `Astro.url` — which is
 * only trustworthy behind a proxy when `security.allowedDomains` is set. This
 * route does not depend on that being right: `guardAdminApiRequest` runs its own
 * origin check against the deployment's real origins, and a custom header
 * cannot be sent cross-origin without a CORS preflight the browser will refuse.
 */
export const POST: APIRoute = async ({ request }) => {
  const guard = await guardAdminApiRequest(request);

  if (!guard.ok) {
    return guard.response;
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");

  // Fail before buffering a body we are only going to reject.
  if (declaredLength > MAX_UPLOAD_BYTES) {
    return jsonError(
      `Images must be under ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`,
      413,
    );
  }

  const fileName = decodeFileName(request.headers.get("x-file-name"));
  const contentType = (request.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  let file: File;

  try {
    const bytes = await request.arrayBuffer();

    if (bytes.byteLength === 0) {
      return jsonError("Choose an image to upload.", 400);
    }

    file = new File([bytes], fileName, { type: contentType });
  } catch {
    return jsonError("The upload could not be read.", 400);
  }

  try {
    const result = await uploadImage(file);

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    logAdmin("info", "upload.succeeded", {
      userId: redactShooSub(guard.session.pairwiseSub),
      key: result.key,
      size: result.size,
    });

    await logAdminActivity({
      actor: guard.session.pairwiseSub,
      action: "upload.image",
      target: result.name,
      details: { key: result.key, size: result.size },
    });

    return jsonResponse({
      url: result.url,
      key: result.key,
      name: result.name,
      size: result.size,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The upload failed.";
    logAdmin("error", "upload.failed", { error: message });

    return jsonError(message, 502);
  }
};
