# GMHS Mini-THON Website

This repository contains the official website for Great Mills High School Mini-THON, built with [Astro](https://astro.build/) and deployed on [Vercel](https://vercel.com/). The site provides information about our club, events, fundraising, and resources for members and sponsors.

## Tech Stack

- **Framework:** [Astro](https://docs.astro.build/) (static site generator with SSR support)
- **Hosting:** [Vercel](https://vercel.com/) (via `@astrojs/vercel` adapter)
- **Content:** JSON data files + MDX pages
- **Runtime & Package Manager:** [Bun](https://bun.sh/)

## Project Structure

```
src/
├── components/       # Reusable UI components
│   ├── Card.astro             # Card display component
│   ├── EventCountdown.astro   # Countdown timer for upcoming events
│   ├── EventMDXContent.astro  # Renders MDX content for event pages
│   ├── ImageCarousel.astro    # Image slideshow component
│   ├── MDXContent.astro       # General MDX content renderer
│   ├── NavBehavior.astro      # Navigation bar behavior/logic
│   └── SocialPopup.astro      # Social media links popup
├── data/             # JSON data files (edit these to update site content)
│   ├── clubInfo.json            # Officers, mission, meeting times, social media
│   ├── fundraising.json         # Fundraising totals, goals, and history
│   ├── memberAnnouncements.json # Member portal announcements
│   ├── memberResources.json     # Member resource links
│   ├── redirects.json           # Short URL redirects (e.g., /redirect/donate)
│   └── sponsors.json            # Sponsor names, tiers, logos, and websites
├── layouts/          # Page layout templates
│   ├── EventLayout.astro        # Layout for individual event pages
│   ├── Layout.astro             # Base layout
│   ├── MemberEventLayout.astro  # Layout for member-facing event details
│   ├── MemberLayout.astro       # Layout for member portal pages
│   └── PublicLayout.astro       # Layout for public-facing pages
├── pages/            # Site pages (each file = a route)
│   ├── index.astro              # Homepage
│   ├── about.astro              # About the club
│   ├── events.astro             # Events listing page
│   ├── events/                  # Individual event pages (MDX files)
│   ├── fundraising.astro        # Fundraising progress and history
│   ├── get-involved.astro       # How to join or help
│   ├── sponsors.astro           # Current sponsors display
│   ├── sponsorship.astro        # Sponsorship info for potential sponsors
│   ├── members/                 # Member-only portal pages
│   ├── api/                     # API endpoints (e.g., newsletter)
│   ├── redirect/[slug].astro    # Dynamic redirect handler
│   └── 404.astro                # Custom 404 page
└── utils/            # Utility functions
    ├── announcements.ts         # Announcement display helpers
    ├── auth.ts                  # Member authentication logic
    └── events.ts                # Event data processing
```

Key configuration files in the project root:

| File              | Purpose                                                        |
| ----------------- | -------------------------------------------------------------- |
| `astro.config.ts` | Astro framework configuration (Vercel adapter, MDX, analytics) |
| `package.json`    | Dependencies and npm scripts                                   |
| `bun.lock`        | Locked dependency versions                                     |

## How to Update the Site

Most site content is managed through JSON files in `src/data/`. Edit these files and the site will automatically reflect your changes on the next deploy.

### Adding a New Event

Events are individual MDX files in `src/pages/events/`. Each file becomes a page at `/events/<filename>`.

1. Create a new `.mdx` file in `src/pages/events/` (e.g., `bake-sale.mdx`).
2. Use this template:

```mdx
---
layout: ../../layouts/EventLayout.astro
title: Your Event Name
date: MM-DD-YYYY
location: Event Location
event_type: type
summary: A brief one-line description of the event.
---

Public-facing description of the event goes here. This is what everyone sees.

<Fragment slot="member-details">

**Event Lead:** Name

### Member notes

- Internal details only visible to logged-in members

</Fragment>
```

**Frontmatter fields:**

- `layout` — Always use `../../layouts/EventLayout.astro`
- `title` — Event name displayed as the heading
- `date` — Event date in `MM-DD-YYYY` format
- `location` — Where the event takes place
- `event_type` — Category of event (e.g., `race`, `game`, `fundraiser`)
- `summary` — Short description shown on the events listing page

**Content sections:**

- The main body (outside `<Fragment>`) is the public event description
- Content inside `<Fragment slot="member-details">` is only visible to logged-in members

### Updating Sponsor Information

Sponsors are stored in `src/data/sponsors.json`. Each sponsor has:

```json
{
  "name": "Sponsor Name",
  "tier": "Gold",
  "logo": "https://example.com/logo.png",
  "website": "https://example.com"
}
```

**To add a new sponsor:**

1. Upload the sponsor's logo image using the upload script (`bun run upload`) or add it to a hosted location.
2. Add a new entry to the `sponsors` array in `src/data/sponsors.json`.
3. Set the `tier` to one of: `Platinum`, `Gold`, `Silver`, or `Bronze`.

**To remove a sponsor:** Delete their entry from the JSON array.

### Updating Fundraising Data

Edit `src/data/fundraising.json`:

```json
{
  "currentYear": 2026,
  "currentTotal": 3751,
  "goalTotal": 13000,
  "history": [{ "year": 2025, "total": 12474.54 }],
  "donorDriveLink": "https://fourdiamonds.donordrive.com/GMHSMT"
}
```

- Update `currentTotal` as donations come in
- Update `goalTotal` at the start of each year
- Add previous year totals to the `history` array
- Update `currentYear` when a new fundraising cycle begins

### Updating Club Officers

Edit the `officers` array in `src/data/clubInfo.json`. Each officer entry has a `role`, `name`, and `email` field. Update these at the start of each school year when new officers are elected.

### Updating Club Info (Mission, Meetings, Social Media)

All in `src/data/clubInfo.json`:

- `mission` — Club mission statement (array of paragraphs)
- `about` / `aboutContinued` — About page text (arrays of paragraphs)
- `meetings` — Meeting schedule with `general` and `board` fields
- `socialMedia` — Links to Instagram, GroupMe, Facebook, TikTok, etc.

### Adding Member Announcements

Edit `src/data/memberAnnouncements.json` to add entries to the `announcements` array:

```json
{
  "title": "Announcement Title",
  "descriptionMdx": "Announcement body text (supports MDX formatting)",
  "type": "info",
  "dateAdded": "YYYY-MM-DD",
  "pin": false
}
```

Set `pin: true` to keep an announcement at the top of the list.

### Adding Redirects

Edit `src/data/redirects.json` to create short URLs. Each entry maps a slug to a destination:

```json
{
  "slug": "donate",
  "label": "Donate",
  "url": "https://fourdiamonds.donordrive.com/GMHSMT"
}
```

This creates a redirect at `/redirect/donate` that points to the specified URL.

## Local Development

### Prerequisites

- [Node.js](https://nodejs.org/) 24.x
- [Bun](https://bun.sh/)

### Getting Started

1. Clone the repository:

   ```sh
   git clone https://github.com/Psavvas/gmhsminithon.org.git
   cd gmhsminithon.org
   ```

2. Install dependencies:

   ```sh
   bun install
   ```

3. Start the development server:

   ```sh
   bun run dev
   ```

   The site will be available at `http://localhost:4321`.

4. Make your changes (edit JSON files, add pages/components, update assets).

### Build & Preview

```sh
bun run build     # Build for production
bun run preview   # Preview the production build locally
```

### Members Portal Configuration

- `PUBLIC_SHOO_BASE_URL` (optional): overrides the Shoo base URL. Defaults to
  `https://shoo.dev`.
- `MEMBER_APPROVED_SHOO_SUBS` (required for member access): a comma-separated
  or newline-separated list of approved Shoo `pairwise_sub` values.
- `MEMBER_APPROVED_SHOO_SUBS_GOOGLE_SHEET_CSV_URL` (optional): an HTTPS
  `docs.google.com` CSV export URL for a Google Sheet whose first column
  contains approved Shoo `pairwise_sub` values. The server combines this with
  any IDs in `MEMBER_APPROVED_SHOO_SUBS`.

For Vercel deployments, add `MEMBER_APPROVED_SHOO_SUBS` in the project's
Environment Variables settings for each environment that needs member login
(Production / Preview / Development as applicable), then redeploy so the server
functions pick it up.

Quick setup on Vercel:

1. In Shoo, make sure your app's callback/return URL points to
   `/members/auth/callback` on the deployed site.
2. In Vercel, open the project's **Settings → Environment Variables**.
3. Add `MEMBER_APPROVED_SHOO_SUBS` with any starter Shoo user IDs you want to
   allow immediately.
4. If you want to manage approvals in Google Sheets, add
   `MEMBER_APPROVED_SHOO_SUBS_GOOGLE_SHEET_CSV_URL` with the sheet's CSV export
   URL.
5. Redeploy the site so the server picks up the new values.
6. Visit `/members/login` and sign in once to confirm the setup. If a user is
   not approved yet, the page will show that user's Shoo user ID so it can be
   added to the env var list or Google Sheet.

Example:

```sh
MEMBER_APPROVED_SHOO_SUBS="sub_123,sub_456"
```

Google Sheet example:

```sh
MEMBER_APPROVED_SHOO_SUBS_GOOGLE_SHEET_CSV_URL="https://docs.google.com/spreadsheets/d/.../export?format=csv"
```

Notes for the Google Sheet allowlist:

- Publish or share the sheet so the server can read the CSV export URL.
- Put one Shoo `pairwise_sub` value per row in the first column.
- An optional header such as `pairwise_sub` or `user id` is allowed in the
  first row.
- If you also keep some IDs in `MEMBER_APPROVED_SHOO_SUBS`, the server merges
  both sources automatically.
- The server only accepts HTTPS `docs.google.com` CSV export URLs, caches the
  result briefly, and fails closed if the sheet cannot be loaded.

If a user can authenticate with Shoo but is not approved yet, the members login
flow will show that user's Shoo user ID so an admin can add it privately to
the approved member list without committing personal data to the repository.
If the environment variable is missing on a deployment, users can still try to
sign in and the login flow will explain that member access is not configured
yet after Shoo authentication.

### Deployment

The site is automatically deployed to [Vercel](https://vercel.com/) when changes are pushed to the main branch. No manual deployment steps are needed.

## Additional Notes

- All site content is managed via JSON files and MDX pages — no database is required.
- Static assets (images, logos) can be placed in the `src/assets/` directory or uploaded externally.
- The member portal (`/members/`) uses Shoo authentication plus a private
  server-side allowlist stored in `MEMBER_APPROVED_SHOO_SUBS` and/or an
  optional Google Sheet CSV configured with
  `MEMBER_APPROVED_SHOO_SUBS_GOOGLE_SHEET_CSV_URL`. Use Shoo `pairwise_sub`
  values rather than committed email addresses.
- For questions or help, contact the current club officers (see `src/data/clubInfo.json`).

---

For more information about Astro, see [Astro Documentation](https://docs.astro.build/).
