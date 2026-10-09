const DONOR_DRIVE_ORIGIN = "https://fourdiamonds.donordrive.com";
const CAMPAIGN_URL = `${DONOR_DRIVE_ORIGIN}/gmhsmt`;
export const DONOR_DRIVE_REFRESH_MS = 30 * 60_000;
const SNAPSHOT_CACHE_MS = 20_000;
const STALE_MAX_MS = 24 * 60 * 60_000;

export type DonorDriveSnapshot = {
  total: number | null;
  refreshedAt: number | null;
  nextRefreshAt: number;
};

export type DonorDriveCacheStore = {
  read: () => Promise<DonorDriveSnapshot>;
  /** Atomically claim one refresh across every server instance. */
  claimRefresh: (force: boolean) => Promise<string | null>;
  completeRefresh: (
    token: string,
    total: number,
  ) => Promise<DonorDriveSnapshot>;
  failRefresh: (token: string) => Promise<void>;
};

const EMPTY_SNAPSHOT: DonorDriveSnapshot = {
  total: null,
  refreshedAt: null,
  nextRefreshAt: 0,
};

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

/** Coordinate refreshes through a durable cache, with memory for local use. */
export function createDonorDriveClient(
  fetchPage: typeof fetch = fetch,
  now: () => number = Date.now,
  getStore?: () => Promise<DonorDriveCacheStore | null>,
): (options?: { forceRefresh?: boolean }) => Promise<number | null> {
  let cached: DonorDriveSnapshot | undefined;
  let checkedAt = -Infinity;
  let generation = 0;
  let inflight: Promise<number | null> | undefined;

  const lastKnownTotal = () =>
    cached?.refreshedAt !== null &&
    cached?.refreshedAt !== undefined &&
    now() - cached.refreshedAt < STALE_MAX_MS
      ? cached.total
      : null;

  return async ({ forceRefresh = false } = {}) => {
    if (inflight) {
      const requestedGeneration = generation;
      try {
        await inflight;
      } catch (error) {
        if (forceRefresh) throw error;
        return lastKnownTotal();
      }
      if (!forceRefresh || generation > requestedGeneration) {
        return lastKnownTotal();
      }
    }
    if (
      !forceRefresh &&
      cached &&
      cached.nextRefreshAt > now() &&
      now() - checkedAt < SNAPSHOT_CACHE_MS
    ) {
      return lastKnownTotal();
    }

    inflight = (async () => {
      let store: DonorDriveCacheStore | null = null;
      let token: string | null = null;
      try {
        // If a configured database is unreachable, do not bypass its lock and
        // multiply API requests across cold starts.
        store = (await getStore?.()) ?? null;
        cached = store ? await store.read() : (cached ?? { ...EMPTY_SNAPSHOT });
        checkedAt = now();
        if (!forceRefresh && cached.nextRefreshAt > now()) {
          return lastKnownTotal();
        }
        token = store ? await store.claimRefresh(forceRefresh) : "memory";
        if (!token) {
          if (forceRefresh) {
            throw new Error(
              "A DonorDrive refresh is already in progress. Try again shortly.",
            );
          }
          return lastKnownTotal();
        }
        // A failed attempt also waits 30 minutes before the next automatic try.
        cached = { ...cached, nextRefreshAt: now() + DONOR_DRIVE_REFRESH_MS };
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
        cached = store
          ? await store.completeRefresh(token, total)
          : {
              total,
              refreshedAt: now(),
              nextRefreshAt: now() + DONOR_DRIVE_REFRESH_MS,
            };
        checkedAt = now();
        generation++;
        return total;
      } catch (error) {
        if (store && token) {
          await store.failRefresh(token).catch((releaseError) => {
            console.warn(
              "[fundraising] DonorDrive refresh lock release failed",
              releaseError,
            );
          });
        }
        if (forceRefresh) throw error;
        console.warn(
          "[fundraising] DonorDrive total could not be refreshed",
          error,
        );
        return lastKnownTotal();
      }
    })().finally(() => {
      inflight = undefined;
    });
    return inflight;
  };
}

export async function resolveFundraisingTotal<
  T extends { currentTotal: number | null },
>(data: T, readTotal: () => Promise<number | null>) {
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
