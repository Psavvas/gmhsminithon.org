import eventsData from '../data/events.json';

export interface Event {
  title: string;
  date: string;
  event_type: string;
  public_description: string;
  internal_description: string;
  media: {
    images: string[];
    links: string[];
  };
}

/**
 * Get all events for the current year
 */
export function getCurrentYearEvents(): Event[] {
  const currentYear = new Date().getFullYear();
  return eventsData.filter((event: Event) => {
    const eventYear = new Date(event.date).getFullYear();
    return eventYear === currentYear;
  });
}

/**
 * Get all events (for member portal)
 */
export function getAllEvents(): Event[] {
  return eventsData as Event[];
}

/**
 * Get a single event by title (slug)
 */
export function getEventBySlug(slug: string): Event | undefined {
  return eventsData.find((event: Event) => 
    event.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') === slug
  );
}

/**
 * Convert event title to URL-friendly slug
 */
export function eventToSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * Format date for display
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
