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
}

type EventModule = {
  frontmatter: EventFrontmatter;
  default?: unknown;
};

function filePathToEventUrl(filePath: string): string {
  return filePath
    .replace('../pages/events/', '/events/')
    .replace(/\.mdx$/, '');
}

async function loadEventModules(): Promise<Array<{ filePath: string; module: EventModule }>> {
  const modules = import.meta.glob('../pages/events/*.mdx', { eager: true }) as Record<string, EventModule>;

  return Object.entries(modules).map(([filePath, module]) => ({ filePath, module }));
}

/**
 * Get all events from MDX files in src/pages/events.
 */
export async function getAllEvents(): Promise<Event[]> {
  const modules = await loadEventModules();

  return modules
    .map(({ filePath, module }) => ({
      ...module.frontmatter,
      url: filePathToEventUrl(filePath),
      Content: module.default
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Get all events for the current year.
 */
export async function getCurrentYearEvents(): Promise<Event[]> {
  const currentYear = new Date().getFullYear();
  const events = await getAllEvents();

  return events.filter((event) => new Date(event.date).getFullYear() === currentYear);
}

/**
 * Get upcoming events from today onward.
 */
export async function getUpcomingEvents(limit?: number): Promise<Event[]> {
  const events = await getAllEvents();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = events.filter((event) => new Date(event.date) >= today);

  return typeof limit === 'number' ? upcoming.slice(0, limit) : upcoming;
}

/**
 * Get a single event by URL slug.
 */
export async function getEventBySlug(slug: string): Promise<Event | undefined> {
  const events = await getAllEvents();
  return events.find((event) => event.url.replace('/events/', '') === slug);
}

/**
 * Convert event title to URL-friendly slug.
 */
export function eventToSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * Format date for display.
 */
function toDateInput(dateValue: string | Date): Date {
  return dateValue instanceof Date ? dateValue : new Date(dateValue);
}

function getIsoDatePart(dateValue: string | Date): string {
  if (typeof dateValue === 'string') {
    const trimmedValue = dateValue.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
      return trimmedValue;
    }

    const parsedFromString = new Date(trimmedValue);
    if (!Number.isNaN(parsedFromString.getTime())) {
      return parsedFromString.toISOString().slice(0, 10);
    }

    return '';
  }

  if (!Number.isNaN(dateValue.getTime())) {
    return dateValue.toISOString().slice(0, 10);
  }

  return '';
}

export function formatDate(dateValue: string | Date): string {
  const date = toDateInput(dateValue);

  if (Number.isNaN(date.getTime())) {
    return typeof dateValue === 'string' ? dateValue : '';
  }

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function normalizeTimeTo24Hour(time?: string): string | undefined {
  if (!time) {
    return undefined;
  }

  const trimmedTime = time.trim();

  const twentyFourHourMatch = trimmedTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (twentyFourHourMatch) {
    const hour = Number.parseInt(twentyFourHourMatch[1], 10);
    const minute = Number.parseInt(twentyFourHourMatch[2], 10);
    const second = twentyFourHourMatch[3] ?? '00';

    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${second}`;
    }
  }

  const twelveHourMatch = trimmedTime.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)$/i);
  if (twelveHourMatch) {
    const baseHour = Number.parseInt(twelveHourMatch[1], 10);
    const minute = Number.parseInt(twelveHourMatch[2] ?? '0', 10);
    const period = twelveHourMatch[3].toLowerCase();

    if (baseHour >= 1 && baseHour <= 12 && minute >= 0 && minute <= 59) {
      const normalizedHour = period === 'pm'
        ? (baseHour === 12 ? 12 : baseHour + 12)
        : (baseHour === 12 ? 0 : baseHour);
      return `${String(normalizedHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
    }
  }

  return undefined;
}

export function getEventDateTimeValue(date: string | Date, time?: string): string {
  const datePart = getIsoDatePart(date);
  if (!datePart) {
    return '';
  }

  const normalizedTime = normalizeTimeTo24Hour(time);
  return `${datePart}T${normalizedTime ?? '00:00:00'}`;
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

  const formattedTime = parsedDateTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  });

  return `${baseDate} at ${formattedTime}`;
}

export function getEventTypeClass(eventType: string): string {
  return eventType
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
