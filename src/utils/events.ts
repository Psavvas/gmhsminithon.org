import { getManagedEvents, type ManagedEvent } from "./content";
import { escapeHtml, renderContentMarkdown } from "./markdown";

export interface EventFrontmatter {
  title: string;
  date: string | Date;
  time?: string;
  location?: string;
  event_type: string;
  summary: string | string[];
  internal_description?: string | string[];
  links?: string[];
}

export interface Event extends EventFrontmatter {
  url: string;
  Content?: any;
  /** Where the event is defined: an .mdx file, or the admin portal. */
  source?: "mdx" | "managed";
  /** Markdown body, for events managed in the admin portal. */
  descriptionMarkdown?: string;
  /** Members-only markdown, for events managed in the admin portal. */
  memberDetailsMarkdown?: string;
  /** Flyer or photo, for events managed in the admin portal. */
  image?: string;
  /** Video embed, for events managed in the admin portal. */
  embedUrl?: string;
}

export interface SplitEvents {
  upcomingEvents: Event[];
  pastEvents: Event[];
}

type EventModule = {
  frontmatter: EventFrontmatter;
  default?: unknown;
};

function filePathToEventUrl(filePath: string): string {
  return filePath.replace("../pages/events/", "/events/").replace(/\.mdx$/, "");
}

async function loadEventModules(): Promise<
  Array<{ filePath: string; module: EventModule }>
> {
  const modules = import.meta.glob("../pages/events/*.mdx", {
    eager: true,
  }) as Record<string, EventModule>;

  return Object.entries(modules).map(([filePath, module]) => ({
    filePath,
    module,
  }));
}

function managedEventToEvent(event: ManagedEvent): Event {
  return {
    title: event.title,
    date: event.date,
    time: event.time || undefined,
    location: event.location || undefined,
    event_type: event.event_type,
    summary: event.summary,
    links: event.links,
    url: `/events/${event.slug}`,
    source: "managed",
    descriptionMarkdown: event.description,
    memberDetailsMarkdown: event.memberDetails,
    image: event.image || undefined,
    embedUrl: event.embedUrl || undefined,
  };
}

/**
 * Turn a share link into something an iframe can actually load. Hosts are
 * already restricted by the schema's embed validation.
 */
export function toEmbedSrc(url: string): string | null {
  try {
    const parsed = new URL(url);

    if (parsed.hostname === "youtu.be") {
      const id = parsed.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (
      parsed.hostname.endsWith("youtube.com") ||
      parsed.hostname.endsWith("youtube-nocookie.com")
    ) {
      const id = parsed.searchParams.get("v");

      if (id) {
        return `https://www.youtube.com/embed/${id}`;
      }

      return parsed.toString();
    }

    if (
      parsed.hostname === "drive.google.com" ||
      parsed.hostname === "docs.google.com"
    ) {
      // /file/d/<id>/view -> /file/d/<id>/preview
      return parsed.toString().replace(/\/(view|edit)(\?.*)?$/, "/preview");
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * The public body of a portal-managed event: description, then any flyer and
 * video embed. Everything is escaped or validated before it reaches the page.
 */
export function renderManagedEventBody(event: Event): string {
  const blocks: string[] = [];
  const summaryText = Array.isArray(event.summary)
    ? event.summary.join("\n\n")
    : event.summary;

  blocks.push(renderContentMarkdown(event.descriptionMarkdown || summaryText));

  // Styling lives in the layouts (`.event-media`), not in inline attributes, so
  // a flyer can be capped and re-laid-out per breakpoint. Portal-uploaded
  // flyers are often tall phone photos, which at full width would push the rest
  // of the page off the screen.
  if (event.image) {
    blocks.push(
      `<figure class="event-media event-media--image">` +
        `<img class="event-media__image" src="${escapeHtml(event.image)}" alt="${escapeHtml(event.title)}" loading="lazy" decoding="async" />` +
        `</figure>`,
    );
  }

  const embedSrc = event.embedUrl ? toEmbedSrc(event.embedUrl) : null;

  if (embedSrc) {
    blocks.push(
      `<div class="event-media event-media--video">` +
        `<iframe class="event-media__frame" src="${escapeHtml(embedSrc)}" title="${escapeHtml(event.title)} video" loading="lazy" allow="fullscreen; picture-in-picture" allowfullscreen></iframe>` +
        `</div>`,
    );
  }

  return blocks.filter(Boolean).join("\n");
}

/**
 * Get all events: the MDX files in src/pages/events plus anything added in the
 * admin portal. An .mdx file wins if both use the same slug, because the file
 * owns that route.
 */
export async function getAllEvents(): Promise<Event[]> {
  const modules = await loadEventModules();
  const mdxEvents: Event[] = modules.map(({ filePath, module }) => ({
    ...module.frontmatter,
    url: filePathToEventUrl(filePath),
    Content: module.default,
    source: "mdx" as const,
  }));
  const mdxUrls = new Set(mdxEvents.map((event) => event.url));
  const managedEvents = (await getManagedEvents())
    .map(managedEventToEvent)
    .filter((event) => !mdxUrls.has(event.url));

  return [...mdxEvents, ...managedEvents].sort(
    (a, b) => getEventDayTimestamp(a.date) - getEventDayTimestamp(b.date),
  );
}

/**
 * Get all events for the current year.
 */
export async function getCurrentYearEvents(): Promise<Event[]> {
  const currentYear = new Date().getFullYear();
  const events = await getAllEvents();

  return events.filter((event) => getEventYear(event.date) === currentYear);
}

/**
 * Get upcoming events from today onward.
 */
export async function getUpcomingEvents(limit?: number): Promise<Event[]> {
  const events = await getAllEvents();
  const { upcomingEvents } = splitEventsByDate(events);
  const upcoming = upcomingEvents;

  return typeof limit === "number" ? upcoming.slice(0, limit) : upcoming;
}

function parseEventDate(dateValue: string | Date): Date {
  if (dateValue instanceof Date) {
    return new Date(
      dateValue.getFullYear(),
      dateValue.getMonth(),
      dateValue.getDate(),
    );
  }

  const trimmedValue = dateValue.trim();
  const dateOnlyMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const year = Number.parseInt(dateOnlyMatch[1], 10);
    const monthIndex = Number.parseInt(dateOnlyMatch[2], 10) - 1;
    const day = Number.parseInt(dateOnlyMatch[3], 10);
    return new Date(year, monthIndex, day);
  }

  const parsedDate = new Date(trimmedValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return new Date(Number.NaN);
  }

  return new Date(
    parsedDate.getFullYear(),
    parsedDate.getMonth(),
    parsedDate.getDate(),
  );
}

function getEventDayTimestamp(dateValue: string | Date): number {
  return parseEventDate(dateValue).getTime();
}

function getEventYear(dateValue: string | Date): number {
  return parseEventDate(dateValue).getFullYear();
}

function getTodayTimestamp(referenceDate: Date = new Date()): number {
  return new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  ).getTime();
}

export function splitEventsByDate(
  events: Event[],
  referenceDate: Date = new Date(),
): SplitEvents {
  const todayTimestamp = getTodayTimestamp(referenceDate);

  const pastEvents = events.filter(
    (event) => getEventDayTimestamp(event.date) < todayTimestamp,
  );
  const upcomingEvents = events.filter(
    (event) => getEventDayTimestamp(event.date) >= todayTimestamp,
  );

  return { upcomingEvents, pastEvents };
}

/**
 * Get a single event by URL slug.
 */
export async function getEventBySlug(slug: string): Promise<Event | undefined> {
  const events = await getAllEvents();
  return events.find((event) => event.url.replace("/events/", "") === slug);
}

/**
 * Convert event title to URL-friendly slug.
 */
export function eventToSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/**
 * Format date for display.
 */
function toDateInput(dateValue: string | Date): Date {
  return dateValue instanceof Date ? dateValue : new Date(dateValue);
}

function getIsoDatePart(dateValue: string | Date): string {
  if (typeof dateValue === "string") {
    const trimmedValue = dateValue.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
      return trimmedValue;
    }

    const parsedFromString = new Date(trimmedValue);
    if (!Number.isNaN(parsedFromString.getTime())) {
      return parsedFromString.toISOString().slice(0, 10);
    }

    return "";
  }

  if (!Number.isNaN(dateValue.getTime())) {
    return dateValue.toISOString().slice(0, 10);
  }

  return "";
}

export function formatDate(dateValue: string | Date): string {
  const date = toDateInput(dateValue);

  if (Number.isNaN(date.getTime())) {
    return typeof dateValue === "string" ? dateValue : "";
  }

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function normalizeTimeTo24Hour(time?: string): string | undefined {
  if (!time) {
    return undefined;
  }

  const trimmedTime = time.trim();

  const twentyFourHourMatch = trimmedTime.match(
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (twentyFourHourMatch) {
    const hour = Number.parseInt(twentyFourHourMatch[1], 10);
    const minute = Number.parseInt(twentyFourHourMatch[2], 10);
    const second = twentyFourHourMatch[3] ?? "00";

    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${second}`;
    }
  }

  const twelveHourMatch = trimmedTime.match(
    /^(\d{1,2})(?::(\d{2}))?\s*([ap]m)$/i,
  );
  if (twelveHourMatch) {
    const baseHour = Number.parseInt(twelveHourMatch[1], 10);
    const minute = Number.parseInt(twelveHourMatch[2] ?? "0", 10);
    const period = twelveHourMatch[3].toLowerCase();

    if (baseHour >= 1 && baseHour <= 12 && minute >= 0 && minute <= 59) {
      const normalizedHour =
        period === "pm"
          ? baseHour === 12
            ? 12
            : baseHour + 12
          : baseHour === 12
            ? 0
            : baseHour;
      return `${String(normalizedHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
    }
  }

  return undefined;
}

export function getEventDateTimeValue(
  date: string | Date,
  time?: string,
): string {
  const datePart = getIsoDatePart(date);
  if (!datePart) {
    return "";
  }

  const normalizedTime = normalizeTimeTo24Hour(time);
  return `${datePart}T${normalizedTime ?? "00:00:00"}`;
}

export function formatEventDate(date: string | Date, time?: string): string {
  const baseDate = formatDate(date);
  if (!time) {
    return baseDate;
  }

  const parsedDateTime = new Date(getEventDateTimeValue(date, time));
  if (Number.isNaN(parsedDateTime.getTime())) {
    return `${baseDate} at ${time}`;
  }

  const formattedTime = parsedDateTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${baseDate} at ${formattedTime}`;
}

export function getEventTypeClass(eventType: string): string {
  return eventType
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
