import type { APIRoute } from "astro";
import { uploadImage } from "../../../utils/admin/uploads";
import { logAdminActivity } from "../../../utils/content/db";
import {
  guardAdminApiRequest,
  jsonError,
  jsonResponse,
  logAdmin,
  redactShooSub,
} from "../../../utils/admin/session";

export const POST: APIRoute = async ({ request }) => {
  const guard = await guardAdminApiRequest(request);

  if (!guard.ok) {
    return guard.response;
  }

  let file: File | null = null;

  try {
    const formData = await request.formData();
    const candidate = formData.get("file");
    file = candidate instanceof File ? candidate : null;
  } catch {
    return jsonError("The upload could not be read.", 400);
  }

  if (!file) {
    return jsonError("Choose an image to upload.", 400);
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
