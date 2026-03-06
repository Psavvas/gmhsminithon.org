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

export function renderAnnouncementMdx(content: string): string {
  if (!content) {
    return "";
  }

  let html = content;

  html = html.replace(/^###\s+(.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^##\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^#\s+(.+)$/gm, "<h2>$1</h2>");

  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  const lines = html.split("\n");
  const processedLines: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith("- ")) {
      if (!inList) {
        processedLines.push("<ul>");
        inList = true;
      }
      processedLines.push(`<li>${trimmedLine.substring(2)}</li>`);
      continue;
    }

    if (inList) {
      processedLines.push("</ul>");
      inList = false;
    }

    if (!trimmedLine) {
      processedLines.push("");
      continue;
    }

    if (
      trimmedLine.startsWith("<h2>") ||
      trimmedLine.startsWith("<h3>") ||
      trimmedLine.startsWith("<h4>")
    ) {
      processedLines.push(trimmedLine);
    } else {
      processedLines.push(`<p>${trimmedLine}</p>`);
    }
  }

  if (inList) {
    processedLines.push("</ul>");
  }

  return processedLines.join("\n");
}
