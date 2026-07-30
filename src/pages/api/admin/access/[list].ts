import type { APIRoute } from "astro";
import {
  addAccessEntry,
  getAccessListState,
  removeAccessEntry,
  type AccessListId,
} from "../../../../utils/admin/access";
import {
  guardAdminApiRequest,
  jsonError,
  jsonResponse,
  logAdmin,
  redactShooSub,
} from "../../../../utils/admin/session";
import { describeDatabaseError } from "../../../../utils/content/db";

function parseListId(value: string | undefined): AccessListId | null {
  return value === "admins" || value === "members" ? value : null;
}

async function listResponse(listId: AccessListId) {
  const state = await getAccessListState(listId, { forceRefresh: true });

  return jsonResponse({
    list: listId,
    entries: state.entries,
    databaseConfigured: state.databaseConfigured,
    warning: state.error,
  });
}

export const GET: APIRoute = async ({ request, params }) => {
  const guard = await guardAdminApiRequest(request, {
    requireSameOrigin: false,
  });

  if (!guard.ok) {
    return guard.response;
  }

  const listId = parseListId(params.list);

  if (!listId) {
    return jsonError("Unknown access list.", 404);
  }

  return listResponse(listId);
};

export const POST: APIRoute = async ({ request, params }) => {
  const guard = await guardAdminApiRequest(request);

  if (!guard.ok) {
    return guard.response;
  }

  const listId = parseListId(params.list);

  if (!listId) {
    return jsonError("Unknown access list.", 404);
  }

  let body: { shooSub?: unknown; label?: unknown };

  try {
    body = (await request.json()) as { shooSub?: unknown; label?: unknown };
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  try {
    const result = await addAccessEntry(
      listId,
      body,
      guard.session.pairwiseSub,
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    logAdmin("info", "access.entry_added", {
      list: listId,
      userId: redactShooSub(guard.session.pairwiseSub),
    });

    return listResponse(listId);
  } catch (error) {
    return jsonError(describeDatabaseError(error), 503);
  }
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const guard = await guardAdminApiRequest(request);

  if (!guard.ok) {
    return guard.response;
  }

  const listId = parseListId(params.list);

  if (!listId) {
    return jsonError("Unknown access list.", 404);
  }

  let body: { shooSub?: unknown };

  try {
    body = (await request.json()) as { shooSub?: unknown };
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  try {
    const result = await removeAccessEntry(
      listId,
      body,
      guard.session.pairwiseSub,
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    logAdmin("info", "access.entry_removed", {
      list: listId,
      userId: redactShooSub(guard.session.pairwiseSub),
    });

    return listResponse(listId);
  } catch (error) {
    return jsonError(describeDatabaseError(error), 503);
  }
};
