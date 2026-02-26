
# GMHS Mini-THON Website

This repository contains the official website for Great Mills High School Mini-THON, built with [Astro](https://astro.build/). The site provides information about our club, events, fundraising, and resources for members and sponsors.

## Website Organization

The project is organized as follows:

- `src/pages/` — Main site pages. Each `.astro` or `.mdx` file is a route:
  - `index.astro`: Homepage
  - `about.astro`: About the club
  - `events.astro`: Events overview
  - `fundraising.astro`: Fundraising info
  - `get-involved.astro`: How to join or help
  - `sponsors.astro`, `sponsorship.astro`: Sponsor info
  - `members/`: Member-only pages (announcements, club info, resources, login, upcoming events)
  - `events/`: Individual event pages (`.mdx` files)
  - `api/`: API endpoints (e.g., newsletter)
- `src/components/` — Reusable UI components (cards, carousels, countdowns, navigation, etc.)
- `src/layouts/` — Page layouts (public, event, member, etc.)
- `src/data/` — JSON files for club info, fundraising, announcements, resources, redirects, sponsors
- `src/utils/` — Utility functions (event handling, authentication, etc.)
- `public/` — Static assets (images, banners, sponsor logos, etc.)
- `scripts/` — Utility scripts

## How to Update the Site

### Elected Officers
- Officers are listed in `src/data/clubInfo.json` under the `officers` array.
- To update, edit the officer entries (role, name, email) in the JSON file.

### Website Description & Mission
- The club mission and description are in `src/data/clubInfo.json` (`mission`, `about`, `aboutContinued`).
- Update these fields to change the homepage and about page text.

### Member Files
- Member announcements: `src/data/memberAnnouncements.json`
- Member resources: `src/data/memberResources.json`
- Club info: `src/data/clubInfo.json`
- To add or update, edit the relevant JSON files.

### New Events
- Events are listed in `src/pages/events/` as `.mdx` files (one per event).
- To add a new event:
  1. Create a new `.mdx` file in `src/pages/events/` (e.g., `new-event.mdx`).
  2. Fill in the event details (title, date, summary, etc.) using the existing files as templates.
- Event metadata may also be managed in `src/data/events.json` or similar utility files.

### Fundraising Totals
- Fundraising data is in `src/data/fundraising.json`.
- Update `currentTotal`, `goalTotal`, and `currentYear` to reflect new totals and goals.
- The homepage and fundraising page will automatically show updated values.

### Sponsors
- Sponsor information is in `src/data/sponsors.json` and images in `public/sponsors/`.
- To add a sponsor, update the JSON file and add their logo/image to the public folder.

### Announcements & Redirects
- Announcements: `src/data/memberAnnouncements.json`
- Redirects: `src/data/redirects.json`
- Edit these files to update site-wide announcements or add new redirects.

## Editing & Deployment

1. Clone the repository and install dependencies:
	```sh
	pnpm install
	```
2. Start the development server:
	```sh
	pnpm run dev
	```
3. Make your changes (edit JSON files, add pages/components, update assets).
4. Build for production:
	```sh
	pnpm run build
	```
5. Preview locally:
	```sh
	pnpm run preview
	```
6. Deploy to your hosting provider (e.g., Vercel).

## Additional Notes

- All site content is managed via JSON files and Markdown/MDX pages for easy editing.
- Static assets (images, logos) are in the `public/` directory.
- For code changes, use the Astro framework and follow component/layout conventions.
- For questions or help, contact the current club officers (see `clubInfo.json`).

---
For more information about Astro, see [Astro Documentation](https://docs.astro.build/).
