# GMHS Mini-THON Website

This repository contains the official website for Great Mills High School Mini-THON, built with [Astro](https://astro.build/) and deployed on [Vercel](https://vercel.com/). The site provides information about our club, events, fundraising, and resources for members and sponsors.

## Tech Stack

- **Framework:** [Astro](https://docs.astro.build/) (static site generator with SSR support)
- **Hosting:** [Vercel](https://vercel.com/) (via `@astrojs/vercel` adapter)
- **Content:** Admin portal backed by [Neon](https://neon.tech/) Postgres, falling back to the JSON data files in the repository
- **Auth:** [Shoo](https://shoo.dev/) for both the member portal and the admin portal
- **Images:** [UploadThing](https://uploadthing.com/)
- **Runtime & Package Manager:** [Bun](https://bun.sh/)

## Project Structure

```
src/
├── components/       # Reusable UI components
│   ├── admin/                 # Admin portal UI (React islands)
│   │   ├── AccessManager.tsx      # Add/remove admin and member Shoo IDs
│   │   ├── AdminAuthCallback.tsx  # Shoo callback handling for /admin
│   │   ├── AdminLogin.tsx         # Shoo sign-in for /admin
│   │   ├── CollectionEditor.tsx   # Schema-driven content editor
│   │   └── ImageField.tsx         # Image upload field (UploadThing)
│   ├── Card.astro             # Card display component
│   ├── EventCountdown.astro   # Countdown timer for upcoming events
│   ├── EventMDXContent.astro  # Renders MDX content for event pages
│   ├── ImageCarousel.astro    # Image slideshow component
│   ├── MDXContent.astro       # General MDX content renderer
│   ├── NavBehavior.astro      # Navigation bar behavior/logic
│   └── SocialPopup.astro      # Social media links popup
├── data/             # Default content, used until a section is saved in the admin portal
│   ├── clubInfo.json            # Officers, mission, meeting times, social media
│   ├── events.json              # Events created in the admin portal (empty by default)
│   ├── fundraising.json         # Fundraising totals, goals, and history
│   ├── memberAnnouncements.json # Member portal announcements
│   ├── memberResources.json     # Member resource links
│   ├── redirects.json           # Short URL redirects (e.g., /redirect/donate)
│   └── sponsors.json            # Sponsor names, tiers, logos, and websites
├── layouts/          # Page layout templates
│   ├── AdminLayout.astro        # Layout + styles for the admin portal
│   ├── EventLayout.astro        # Layout for individual event pages
│   ├── Layout.astro             # Base layout
│   ├── MemberEventLayout.astro  # Layout for member-facing event details
│   ├── MemberLayout.astro       # Layout for member portal pages
│   └── PublicLayout.astro       # Layout for public-facing pages
├── pages/            # Site pages (each file = a route)
│   ├── index.astro              # Homepage
│   ├── about.astro              # About the club
│   ├── events.astro             # Events listing page
│   ├── events/                  # Event pages: MDX files + [slug] for portal events
│   ├── fundraising.astro        # Fundraising progress and history
│   ├── get-involved.astro       # How to join or help
│   ├── sponsors.astro           # Current sponsors display
│   ├── sponsorship.astro        # Sponsorship info for potential sponsors
│   ├── members/                 # Member-only portal pages
│   ├── admin/                   # Admin portal (sign-in, overview, editors, access)
│   ├── api/                     # API endpoints (newsletter, member auth, admin)
│   ├── redirect/[slug].astro    # Dynamic redirect handler
│   └── 404.astro                # Custom 404 page
└── utils/            # Utility functions
    ├── admin/
    │   ├── access.ts            # Admin + member Shoo ID lists
    │   ├── session.ts           # Admin session cookies and API guards
    │   └── uploads.ts           # UploadThing image uploads
    ├── announcements.ts         # Announcement display helpers
    ├── auth.ts                  # Member authentication logic
    ├── content.ts               # Content accessors used by pages
    ├── content/
    │   ├── collections.ts       # What the admin portal can edit
    │   ├── db.ts                # Neon connection + table setup
    │   ├── fieldSpec.ts         # Field schema, validation, normalization
    │   └── store.ts             # Reads/writes content, with caching
    ├── env.ts                   # Environment variable helpers
    ├── events.ts                # Event data processing
    └── markdown.ts              # Escaping Markdown renderer for portal content
```

Key configuration files in the project root:

| File              | Purpose                                                        |
| ----------------- | -------------------------------------------------------------- |
| `astro.config.ts` | Astro framework configuration (Vercel adapter, MDX, analytics) |
| `package.json`    | Dependencies and npm scripts                                   |
| `bun.lock`        | Locked dependency versions                                     |

## Admin Portal

The admin portal at **`/admin`** is the normal way to change site content — no code,
no pull request, no redeploy. It signs in with Shoo (the same login the member
portal uses) and stores content in a Neon Postgres database.

### What you can edit

| Section              | What it controls                                                          |
| -------------------- | ------------------------------------------------------------------------- |
| Fundraising totals   | Running total, goal, previous years, DonorDrive link                      |
| Sponsors             | Names, tiers, logos (uploaded to UploadThing), websites                   |
| Events               | Events on `/events`, each with a public description and member-only notes |
| Club info            | Mission, about text, officers, meeting times, social links, contact email |
| Short links          | `/redirect/<slug>` short URLs                                             |
| Member announcements | Announcements in the member portal                                        |
| Member resources     | Quick links for members                                                   |
| Shoo IDs             | Who can use the admin portal, and who can use the member portal           |

### Where content comes from

Each section is read in this order:

1. **The database**, if that section has been saved in the portal at least once.
2. **The JSON file in `src/data/`**, otherwise.

So the site keeps working with no database attached — it just serves what is in
the repository, and the portal is read-only. The moment `DATABASE_URL` is set,
saving a section takes over that section. "Revert to file version" in the editor
deletes the stored copy and hands the section back to the JSON file.

Content pages are server-rendered with a 30-second CDN cache
(`s-maxage=30, stale-while-revalidate=300`), so edits appear on the live site
within about half a minute without a redeploy.

### First-time setup

1. **Find your Shoo user ID.** Visit `/admin/login` (or `/members/login`) and sign
   in with Shoo. Because you are not on the admin list yet, the page shows your
   Shoo user ID and a copy button.
2. **In Vercel → Settings → Environment Variables**, add:
   - `ADMIN_APPROVED_SHOO_SUBS` — your Shoo user ID. This is the bootstrap list;
     IDs here cannot be removed from inside the portal, so you cannot lock
     yourself out.
   - `ADMIN_SESSION_SECRET` — a long random value (`openssl rand -hex 32`).
     Required; the portal refuses to sign anyone in without it.
3. **Redeploy**, then sign in at `/admin`.
4. **Connect Neon** when you are ready to edit content (see below). Until then
   the portal shows the current content read-only and tells you what is missing.
5. **Add `UPLOADTHING_TOKEN`** to enable image uploads. Without it you can still
   paste image URLs.

### Connecting Neon

1. Create a Neon project (or use Vercel's Neon integration, which sets the
   environment variables automatically).
2. Copy the pooled connection string and add it in Vercel as `DATABASE_URL`
   (`CONTENT_DATABASE_URL`, `NEON_DATABASE_URL`, `POSTGRES_URL`,
   `DATABASE_URL_UNPOOLED`, and `POSTGRES_URL_NON_POOLING` are also accepted, in
   that order of preference).
3. Redeploy. The tables are created automatically on first use — there is no
   migration step:

   | Table                | Purpose                                     |
   | -------------------- | ------------------------------------------- |
   | `site_content`       | One JSONB document per content section      |
   | `admin_users`        | Shoo IDs with admin access                  |
   | `member_approvals`   | Shoo IDs approved for the member portal     |
   | `admin_activity_log` | Who changed what, shown as "Recent changes" |

4. Open `/admin` — the Setup panel should show the database as connected.

If the database is unreachable, the site serves the last content it read (or the
JSON files) rather than erroring, and the portal shows a warning.

### Managing Shoo IDs

`/admin/access` manages two lists:

- **Admins** — can edit content and manage both lists.
- **Approved members** — can sign in at `/members`.

Ask the person to sign in once at `/members/login`; the page shows their Shoo user
ID, which you paste into the portal with an optional note ("Sam, treasurer").
Nothing personal is committed to the repository. Removing an ID takes effect
within seconds.

Member approvals from the portal are merged with the two existing sources —
`MEMBER_APPROVED_SHOO_SUBS` and the Google Sheet — so nothing that already works
stops working. IDs that come from an environment variable are shown in the portal
but marked read-only, and you cannot remove your own admin access.

### Images

Image fields (such as sponsor logos) upload straight to UploadThing from the
editor: pick a file or drag one in, and the resulting URL is stored with the
content. PNG, JPEG, WebP, AVIF, GIF, and SVG are accepted, up to 8 MB. The
UploadThing token never leaves the server — the browser posts the file to
`/api/admin/upload`, which forwards it.

### Events in the portal vs. `.mdx` files

Both work at the same time. Events created in the portal get a page at
`/events/<slug>`, and events that live in `src/pages/events/*.mdx` keep their own
routes and full MDX capabilities. They are listed together, sorted by date. If a
portal event and an `.mdx` file use the same slug, the file wins.

## How to Update the Site

Everything below is the manual, in-repository alternative to the admin portal.
It still works, and it is what the site falls back to for any section that has
never been saved in the portal.

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
- `MEMBER_APPROVED_SHOO_SUBS` (one way to grant member access): a comma-separated
  or newline-separated list of approved Shoo `pairwise_sub` values. The admin
  portal's "Approved members" list is merged with this and with the Google Sheet
  below, so any of the three grants access.
- `MEMBER_APPROVED_SHOO_SUBS_GOOGLE_SHEET_CSV_URL` (optional): an HTTPS
  `docs.google.com` CSV export URL for a Google Sheet whose first column
  contains approved Shoo `pairwise_sub` values. The server combines this with
  any IDs in `MEMBER_APPROVED_SHOO_SUBS`.
- `MEMBER_AUTH_DEBUG` (optional): set to `true` to enable detailed server-side
  auth logging for member session verification, approval cache refreshes, and
  member auth API decisions.
- `MEMBER_SESSION_SECRET` (recommended for production): a long random secret
  used to issue a server-signed member session after approval. This avoids
  re-checking the Google Sheet on every protected page request and is the
  recommended setup for Bun on Vercel.

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
5. Add `MEMBER_SESSION_SECRET` with a long random value for stable production
   member sessions.
6. Redeploy the site so the server picks up the new values.
7. Visit `/members/login` and sign in once to confirm the setup. If a user is
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

### Admin Portal Configuration

- `ADMIN_APPROVED_SHOO_SUBS` (required to get started): Shoo user IDs that always
  have admin access. Cannot be removed from inside the portal.
- `ADMIN_SESSION_SECRET` (required): secret for signing admin session cookies.
  Falls back to `MEMBER_SESSION_SECRET`, but a separate value is better. Admin
  sessions last 8 hours.
- `DATABASE_URL` (required to save content): Neon Postgres connection string.
  Without it the portal is read-only and the site serves `src/data/*.json`.
- `UPLOADTHING_TOKEN` (optional): enables image uploads from the portal.
- `ADMIN_AUTH_DEBUG` (optional): set to `true` for verbose admin sign-in logging.

## Additional Notes

- Site content is edited in the admin portal at `/admin` and stored in Neon; the
  JSON files in `src/data/` are the defaults the site falls back to, so the site
  runs fine with no database attached.
- Static assets (images, logos) can be placed in the `src/assets/` directory,
  uploaded through the admin portal, or uploaded externally.
- The member portal (`/members/`) uses Shoo authentication plus a private
  server-side allowlist: the admin portal's "Approved members" list,
  `MEMBER_APPROVED_SHOO_SUBS`, and an optional Google Sheet CSV configured with
  `MEMBER_APPROVED_SHOO_SUBS_GOOGLE_SHEET_CSV_URL`. Use Shoo `pairwise_sub`
  values rather than committed email addresses.
- Content written in the admin portal is rendered through an escaping Markdown
  renderer (`src/utils/markdown.ts`), so portal text cannot inject HTML into a
  page, and link targets are limited to `http(s)`, `mailto`, `tel`, and
  site-relative paths.
- For questions or help, contact the current club officers (see `src/data/clubInfo.json`).

---

For more information about Astro, see [Astro Documentation](https://docs.astro.build/).
