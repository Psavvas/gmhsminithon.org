const DONOR_DRIVE_ORIGIN = "https://fourdiamonds.donordrive.com";
const CAMPAIGN_URL = `${DONOR_DRIVE_ORIGIN}/gmhsmt`;
const CACHE_MS = 60_000;
const RETRY_MS = 30_000;
const STALE_MAX_MS = 15 * 60_000;

/** Read the campaign ID from the short URL so it follows yearly rollovers. */
export function getDonorDriveEventId(html: string): number {
  const context = html.match(/\bdata-page-context=(["'])(.*?)\1/i)?.[2];
  if (!context) throw new Error("DonorDrive campaign context is missing.");

  const decoded = context.replace(
    /&#(x[0-9a-f]+|\d+);|&(quot|amp|apos);/gi,
    (_entity, code: string | undefined, name: string | undefined) => {
      if (code) {
        return String.fromCodePoint(
          code[0].toLowerCase() === "x"
            ? parseInt(code.slice(1), 16)
            : parseInt(code, 10),
        );
      }
      return { quot: '"', amp: "&", apos: "'" }[name!.toLowerCase()]!;
    },
  );
  const { eventID } = JSON.parse(decoded);
  if (!Number.isSafeInteger(eventID) || eventID <= 0) {
    throw new Error("DonorDrive campaign ID is invalid.");
  }
  return eventID;
}

/** Cache public reads and briefly retain the last valid total during outages. */
export function createDonorDriveClient(
  fetchPage: typeof fetch = fetch,
  now: () => number = Date.now,
): () => Promise<number | null> {
  let cached: { total: number; fetchedAt: number } | undefined;
  let retryAt = 0;
  let inflight: Promise<number | null> | undefined;

  const lastKnownTotal = () =>
    cached && now() - cached.fetchedAt < STALE_MAX_MS ? cached.total : null;

  return async () => {
    if (cached && now() - cached.fetchedAt < CACHE_MS) return cached.total;
    if (inflight) return inflight;
    if (now() < retryAt) return lastKnownTotal();

    inflight = (async () => {
      try {
        // One timeout covers both requests, including reading their bodies.
        const options = {
          signal: AbortSignal.timeout(5_000),
          headers: { "Accept-Language": "en" },
        };
        const page = await fetchPage(CAMPAIGN_URL, options);
        if (!page.ok)
          throw new Error(`DonorDrive page returned ${page.status}.`);
        const eventID = getDonorDriveEventId(await page.text());
        const event = await fetchPage(
          `${DONOR_DRIVE_ORIGIN}/api/events/${eventID}`,
          options,
        );
        if (!event.ok)
          throw new Error(`DonorDrive API returned ${event.status}.`);
        const data = await event.json();
        const total = data.sumDonations;
        if (
          data.eventID !== eventID ||
          typeof total !== "number" ||
          !Number.isFinite(total) ||
          total < 0
        ) {
          throw new Error("DonorDrive returned an invalid campaign total.");
        }
        cached = { total, fetchedAt: now() };
        retryAt = 0;
        return total;
      } catch (error) {
        console.warn(
          "[fundraising] DonorDrive total could not be refreshed",
          error,
        );
        retryAt = now() + RETRY_MS;
        return lastKnownTotal();
      }
    })().finally(() => {
      inflight = undefined;
    });
    return inflight;
  };
}

export const getDonorDriveTotal = createDonorDriveClient();

export async function resolveFundraisingTotal<
  T extends { currentTotal: number | null },
>(data: T, readTotal = getDonorDriveTotal) {
  if (data.currentTotal !== null && data.currentTotal !== undefined) {
    return { ...data, totalSource: "manual" as const };
  }
  const currentTotal = await readTotal();
  return {
    ...data,
    currentTotal,
    totalSource:
      currentTotal === null
        ? ("unavailable" as const)
        : ("donordrive" as const),
  };
}
