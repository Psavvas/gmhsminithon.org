import type { APIRoute } from "astro";
import {
  guardAdminApiRequest,
  jsonError,
  jsonResponse,
} from "../../../../utils/admin/session";
import {
  isDatabaseConfigured,
  logAdminActivity,
} from "../../../../utils/content/db";
import { getDonorDriveCacheStore } from "../../../../utils/content/donorDriveCache";
import { getDonorDriveTotal } from "../../../../utils/fundraising";

export const POST: APIRoute = async ({ request }) => {
  const guard = await guardAdminApiRequest(request);
  if (!guard.ok) return guard.response;
  if (!isDatabaseConfigured()) {
    return jsonError(
      "Connect the admin database before refreshing DonorDrive.",
      503,
    );
  }

  try {
    const total = await getDonorDriveTotal({ forceRefresh: true });
    const cache = await getDonorDriveCacheStore();
    if (!cache) throw new Error("The admin database is not connected.");
    const snapshot = await cache.read();
    await logAdminActivity({
      actor: guard.session.pairwiseSub,
      action: "fundraising.refresh",
      target: "fundraising",
    });
    return jsonResponse({ total, refreshedAt: snapshot.refreshedAt });
  } catch (error) {
    console.warn("[fundraising] Admin refresh failed", error);
    return jsonError(
      "DonorDrive could not be refreshed. The previous total has been kept. Please try again shortly.",
      503,
    );
  }
};
