import type { APIRoute } from "astro";
import {
  getCollectionSpec,
  validateCollection,
} from "../../../../utils/content/collections";
import {
  readCollection,
  resetCollection,
  writeCollection,
} from "../../../../utils/content/store";
import { describeDatabaseError } from "../../../../utils/content/db";
import {
  guardAdminApiRequest,
  jsonError,
  jsonResponse,
  logAdmin,
  redactShooSub,
} from "../../../../utils/admin/session";

export const GET: APIRoute = async ({ request, params }) => {
  const guard = await guardAdminApiRequest(request, {
    requireSameOrigin: false,
  });

  if (!guard.ok) {
    return guard.response;
  }

  const spec = getCollectionSpec(params.collection ?? "");

  if (!spec) {
    return jsonError("Unknown content collection.", 404);
  }

  const record = await readCollection(spec.id, { forceRefresh: true });

  return jsonResponse({
    collection: spec.id,
    data: record.data,
    source: record.source,
    updatedAt: record.updatedAt,
    updatedBy: record.updatedBy,
    warning: record.error,
  });
};

export const PUT: APIRoute = async ({ request, params }) => {
  const guard = await guardAdminApiRequest(request);

  if (!guard.ok) {
    return guard.response;
  }

  const spec = getCollectionSpec(params.collection ?? "");

  if (!spec) {
    return jsonError("Unknown content collection.", 404);
  }

  let payload: unknown;

  try {
    const body = (await request.json()) as { data?: unknown };
    payload = body?.data;
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  if (payload === undefined || payload === null) {
    return jsonError("Nothing to save.", 400);
  }

  const { value, issues } = validateCollection(spec, payload);

  if (issues.length > 0) {
    return jsonResponse(
      {
        error: "Some fields still need attention.",
        issues,
      },
      422,
    );
  }

  try {
    const result = await writeCollection(
      spec,
      value,
      guard.session.pairwiseSub,
    );

    logAdmin("info", "content.saved", {
      collection: spec.id,
      userId: redactShooSub(guard.session.pairwiseSub),
    });

    return jsonResponse({
      collection: spec.id,
      data: result.data,
      updatedAt: result.updatedAt,
      source: "database",
    });
  } catch (error) {
    const message = describeDatabaseError(error);
    logAdmin("error", "content.save_failed", {
      collection: spec.id,
      error: message,
    });

    return jsonError(message, 503);
  }
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const guard = await guardAdminApiRequest(request);

  if (!guard.ok) {
    return guard.response;
  }

  const spec = getCollectionSpec(params.collection ?? "");

  if (!spec) {
    return jsonError("Unknown content collection.", 404);
  }

  try {
    await resetCollection(spec, guard.session.pairwiseSub);
    const record = await readCollection(spec.id, { forceRefresh: true });

    return jsonResponse({
      collection: spec.id,
      data: record.data,
      source: record.source,
      updatedAt: record.updatedAt,
    });
  } catch (error) {
    return jsonError(describeDatabaseError(error), 503);
  }
};
