/**
 * Site content accessors used by pages and layouts.
 *
 * Pages call these instead of importing `src/data/*.json` directly, so content
 * edited in the admin portal shows up without a redeploy. When no database is
 * configured these return exactly the JSON that ships with the repository.
 */
import { readCollection, readCollectionData } from "./content/store";
import type { RawMemberAnnouncement } from "./announcements";

export type ClubInfo = {
  mission: string[];
  about: string[];
  aboutContinued: string[];
  meetings: {
    general: string;
    board: string;
  };
  socialMedia: {
    instagram: string;
    groupme: string;
    facebook: string;
    tiktok: string;
  };
  officers: Array<{
    role: string;
    name: string;
    email: string;
  }>;
  contact: {
    email: string;
  };
};

export type FundraisingData = {
  currentYear: number;
  currentTotal: number;
  goalTotal: number;
  donorDriveLink: string;
  history: Array<{
    year: number;
    total: number;
  }>;
};

export type Sponsor = {
  name: string;
  tier: string;
  logo: string;
  website: string;
};

export type MemberResource = {
  title: string;
  description: string;
  url: string;
};

export type RedirectEntry = {
  slug: string;
  label: string;
  url: string;
};

export type SiteBanner = {
  message: string;
  color: string;
  placement: "Public site" | "Member portal" | "Both";
  visibility: "Homepage only" | "One event page" | "All pages";
  eventSlug: string;
  enabled: boolean;
};

export async function getSiteBanners(): Promise<SiteBanner[]> {
  const { banners } = await readCollectionData<{ banners: SiteBanner[] }>(
    "banners",
  );

  return banners;
}

export type ManagedEvent = {
  title: string;
  slug: string;
  date: string;
  time: string;
  location: string;
  event_type: string;
  summary: string;
  description: string;
  image: string;
  embedUrl: string;
  memberDetails: string;
  links: string[];
  published: boolean;
};

export async function getClubInfo(): Promise<ClubInfo> {
  return readCollectionData<ClubInfo>("clubInfo");
}

export async function getFundraising(): Promise<FundraisingData> {
  return readCollectionData<FundraisingData>("fundraising");
}

export async function getSponsors(): Promise<Sponsor[]> {
  const { sponsors } = await readCollectionData<{ sponsors: Sponsor[] }>(
    "sponsors",
  );

  return sponsors;
}

export async function getMemberAnnouncements(): Promise<
  RawMemberAnnouncement[]
> {
  const { announcements } = await readCollectionData<{
    announcements: RawMemberAnnouncement[];
  }>("memberAnnouncements");

  return announcements;
}

export async function getMemberResources(): Promise<MemberResource[]> {
  const { resources } = await readCollectionData<{
    resources: MemberResource[];
  }>("memberResources");

  return resources;
}

export async function getRedirects(): Promise<RedirectEntry[]> {
  return readCollectionData<RedirectEntry[]>("redirects");
}

export async function getManagedEvents(
  options: { includeUnpublished?: boolean } = {},
): Promise<ManagedEvent[]> {
  const { events } = await readCollectionData<{ events: ManagedEvent[] }>(
    "events",
  );

  return options.includeUnpublished
    ? events
    : events.filter((event) => event.published);
}

/**
 * Where a collection is currently being served from, for admin status displays.
 */
export async function getContentSourceFor(collectionId: string) {
  const { source, updatedAt, updatedBy } = await readCollection(collectionId);
  return { source, updatedAt, updatedBy };
}

/**
 * Let Vercel's CDN serve managed content quickly while still picking up edits.
 *
 * Only safe on pages whose HTML does not depend on who is signed in.
 */
export function applyContentCacheHeaders(
  response: { headers: Headers },
  options: { maxAgeSeconds?: number } = {},
): void {
  const sMaxAge = options.maxAgeSeconds ?? 30;

  response.headers.set(
    "Cache-Control",
    `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=300`,
  );
}
