export interface EventFrontmatter {
  title: string;
  date: string;
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
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}
