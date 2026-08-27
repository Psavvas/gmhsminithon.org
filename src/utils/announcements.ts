import { renderContentMarkdown } from "./markdown";

export interface RawMemberAnnouncement {
  title: string;
  descriptionMdx?: string;
  message?: string;
  type?: "urgent" | "info" | string;
  dateAdded?: string;
  date?: string;
  pin?: boolean;
}

export interface MemberAnnouncement {
  title: string;
  descriptionMdx: string;
  type: string;
  dateAdded: string;
  pin: boolean;
}

function toTimestamp(dateValue: string): number {
  const parsed = Date.parse(dateValue);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function normalizeAnnouncements(
  announcements: unknown,
): MemberAnnouncement[] {
  if (!Array.isArray(announcements)) {
    return [];
  }

  return announcements
    .filter((announcement): announcement is RawMemberAnnouncement =>
      Boolean(announcement && typeof announcement === "object"),
    )
    .map((announcement) => ({
      title: announcement.title ?? "Untitled Announcement",
      descriptionMdx: announcement.descriptionMdx ?? announcement.message ?? "",
      type: announcement.type ?? "info",
      dateAdded: announcement.dateAdded ?? announcement.date ?? "",
      pin: Boolean(announcement.pin),
    }));
}

export function sortAnnouncementsByDate(
  announcements: MemberAnnouncement[],
): MemberAnnouncement[] {
  return [...announcements].sort(
    (a, b) => toTimestamp(b.dateAdded) - toTimestamp(a.dateAdded),
  );
}

export function sortAnnouncementsPinnedThenDate(
  announcements: MemberAnnouncement[],
): MemberAnnouncement[] {
  return [...announcements].sort((a, b) => {
    if (a.pin !== b.pin) {
      return a.pin ? -1 : 1;
    }
    return toTimestamp(b.dateAdded) - toTimestamp(a.dateAdded);
  });
}

export function getPinnedAnnouncements(
  announcements: MemberAnnouncement[],
): MemberAnnouncement[] {
  return sortAnnouncementsByDate(
    announcements.filter((announcement) => announcement.pin),
  );
}

/**
 * Announcements are written in the admin portal, so they go through the
 * escaping Markdown renderer rather than being trusted as HTML.
 */
export function renderAnnouncementMdx(content: string): string {
  return renderContentMarkdown(content);
}
