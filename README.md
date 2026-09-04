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
├── styles/
│   └── member-portal.css        # Member portal design system (mirrors the admin look)
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

| File              | Purpose                                                          |
| ----------------- | ---------------------------------------------------------------- |
| `astro.config.ts` | Astro framework configuration (Vercel adapter, MDX, analytics)   |
| `package.json`    | Dependencies and npm scripts                                     |
| `bun.lock`        | Locked dependency versions                                       |
| `db/schema.sql`   | Admin portal tables, for running by hand instead of on first use |

## Admin Portal

The admin portal at **`/admin`** is the normal way to change site content — no code,
no pull request, no redeploy. It signs in with Shoo (the same login the member
portal uses) and stores content in a Neon Postgres database.

### What you can edit

| Section              | What it controls                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------- |
| Fundraising totals   | Running total, goal, previous years, DonorDrive link                                     |
| Sponsors             | Names, tiers, logos (uploaded to UploadThing), websites                                  |
| Events               | Events on `/events`, with a description, optional flyer and video, and member-only notes |
| Club info            | Mission, about text, officers, meeting times, social links, contact email                |
| Short links          | `/redirect/<slug>` short URLs                                                            |
| Member announcements | Announcements in the member portal                                                       |
| Member resources     | Quick links for members                                                                  |
| Shoo IDs             | Who can use the admin portal, and who can use the member portal                          |

### Where content comes from

Each section is read in this order:

1. **The database**, if that section has been saved in the portal at least once.
2. **The JSON file in `src/data/`**, otherwise.

So the site keeps working with no database attached — it just serves what is in
the repository, and the portal is read-only. The moment `DATABASE_URL` is set,
saving a section takes over that section for good — saving is one-way, so the
JSON files are the starting point rather than something the portal can fall back
to.

Content pages are server-rendered with a 30-second CDN cache
(`s-maxage=30, stale-while-revalidate=300`), so edits appear on the live site
within about half a minute without a redeploy.

### First-time setup

0. **Decide which address you will administer the site from**, and use it for
   every step below. A Shoo user ID is tied to the exact web address it was
   issued on, so this choice matters — see
   [Shoo user IDs are per web address](#shoo-user-ids-are-per-web-address).
   The production domain is the right answer unless you are testing a branch.
1. **Find your Shoo user ID.** Visit `/admin/login` (or `/members/login`) on that
   address and sign in with Shoo. Because you are not on the admin list yet, the
   page shows your Shoo user ID and a copy button.
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

### If you cannot sign in

Open **`/api/admin/status`** on the deployment you are trying to use, or expand
"Setup status for this deployment" on `/admin/login`. Both report what that
deployment actually has (counts and booleans only — no secrets or IDs):

```json
{
  "adminSessionSecretConfigured": true,
  "adminIdsFromEnv": 1,
  "databaseConfigured": false,
  "requestOrigin": "https://gmhsminithon.org"
}
```

Common causes, in the order worth checking:

1. **The Shoo ID came from a different web address.** See below — this is the
   most common one, and the least obvious.
2. **The deployment does not have the portal yet.** `/admin` only exists on a
   deployment built from a branch that contains it. On production that means
   merging to `main`.
3. **No redeploy after adding the variables.** Vercel only picks up environment
   variables on a new deployment.
4. **The variable was added to the wrong environment.** Vercel keeps Production,
   Preview, and Development separate. A `*.vercel.app` preview URL needs the
   values added to Preview.
5. **Quotes came along with the value.** Pasting `"ps_abc123"` into Vercel makes
   the quotes part of the ID. The site strips surrounding quotes, but the
   cleanest fix is to paste the bare value.

Admins can also use the member portal, so a Shoo ID in
`ADMIN_APPROVED_SHOO_SUBS` needs no separate member approval.

### Shoo user IDs are per web address

Shoo identifies a site by its origin — its `client_id` is literally
`origin:https://example.com` — and a user's `pairwise_sub` is per client. **The
same person therefore has a different Shoo user ID on every web address**:

| Address                                        | Stable?              | Shoo ID          |
| ---------------------------------------------- | -------------------- | ---------------- |
| `gmhsminithon.org`                             | yes                  | `ps_aaa…`        |
| `gmhsminithon-git-<branch>-<scope>.vercel.app` | yes, per branch      | `ps_bbb…`        |
| `gmhsminithon-<hash>-<scope>.vercel.app`       | no, new every deploy | new every deploy |

So an ID copied from one address will never authorize on another, and an ID
captured on a per-deployment URL is worthless by the next deploy. **Do admin
sign-in on one stable address** — the production domain, or a branch alias while
testing — and put the ID from _that_ address in `ADMIN_APPROVED_SHOO_SUBS`.
`ADMIN_APPROVED_SHOO_SUBS` is a list, so if you administer from two addresses,
add the ID from each.

Both sign-in pages detect this: land on a per-deployment URL and they say so, and
link to the stable address to use instead. `/api/admin/status` reports the same
under `signInOrigin`.

Two things this is _not_ fixable with:

- **`PUBLIC_SITE_URL`** tells the server which token origins to accept, so tokens
  minted on the canonical address verify anywhere. It cannot change which address
  the browser is on, so it does not make the Shoo ID stable. Set it anyway — it is
  what lets a stable-address sign-in work across deployments.
- **Session cookies** are scoped to one host by the browser, so a new address
  always means signing in again regardless of configuration.

Vercel sets `VERCEL_URL` (this deployment), `VERCEL_BRANCH_URL` (stable per
branch), and `VERCEL_PROJECT_PRODUCTION_URL` (production) automatically; all
three are accepted as token origins, so nothing extra is needed for the stable
aliases to work.

### Adding a new domain

`security.allowedDomains` in `astro.config.ts` lists the hosts this site is
served from. Vercel terminates TLS at its edge and passes the real host in
`x-forwarded-host`; Astro only trusts that header for hosts matching this list,
and with no match it falls back to `localhost`. That makes `Astro.url` wrong on
every request and makes Astro's built-in CSRF check reject form posts, because
the browser's `Origin` can never equal `https://localhost`.

`**.vercel.app` covers every preview and branch alias, so **if you point a new
custom domain at this project, add it there** — otherwise pages that read
`Astro.url` report the wrong host on that domain.

### Connecting Neon

1. Create a Neon project (or use Vercel's Neon integration, which sets the
   environment variables automatically).
2. Copy the pooled connection string and add it in Vercel as `DATABASE_URL`
   (`CONTENT_DATABASE_URL`, `NEON_DATABASE_URL`, `POSTGRES_URL`,
   `DATABASE_URL_UNPOOLED`, and `POSTGRES_URL_NON_POOLING` are also accepted, in
   that order of preference).
3. Redeploy. The tables are created automatically on first use — there is no
   migration step. To create them yourself instead (for example in the Neon SQL
   Editor), run [`db/schema.sql`](db/schema.sql); it is safe to run more than
   once. Either way you end up with:

   | Table                | Purpose                                                                                            |
   | -------------------- | -------------------------------------------------------------------------------------------------- |
   | `site_content`       | One JSONB document per content section                                                             |
   | `admin_users`        | Shoo IDs with admin access                                                                         |
   | `member_approvals`   | Shoo IDs approved for the member portal                                                            |
   | `admin_activity_log` | Who changed what, shown as "Recent changes". Entries older than 18 months are pruned automatically |

4. Open `/admin` — the Setup panel should show the database as connected.

If the database is unreachable, the site serves the last content it read (or the
JSON files) rather than erroring, and the portal shows a warning.

### Managing Shoo IDs

`/admin/access` manages two lists:

- **Admins** — can edit content and manage both lists.
- **Approved members** — can sign in at `/members`.

Admins can use the member portal too, so an admin does not need a separate member
approval.

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
content. PNG, JPEG, WebP, AVIF, GIF, and SVG are accepted, **up to 4 MB** —
the file passes through a Vercel serverless function, which rejects request
bodies over 4.5 MB. The UploadThing token never leaves the server: the browser
posts the file to `/api/admin/upload`, which forwards it.

`UPLOADTHING_TOKEN` must be the token from the dashboard's API Keys tab, which
base64-decodes to `{ apiKey, appId, regions }`. The `sk_live_…` secret key is
only the `apiKey` field inside it and will not work by itself; the portal checks
the shape and says so rather than failing at upload time.

### Events

Every event is editable in the portal, past ones included — nothing is hidden by
date, and `/events` keeps showing past events in its own section. Each event has
an optional flyer (uploaded to UploadThing) and an optional video embed, which
accepts YouTube, Vimeo, and Google Drive links only.

Events created in the portal get a page at `/events/<slug>`. Adding an
`.mdx` file back into `src/pages/events/` still works if an event ever needs
markup the portal cannot express — such an event appears in the listings
alongside portal events, and wins if it uses the same slug, but it can only be
edited in the repository.

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
  have admin access. Cannot be removed from inside the portal, and also grants
  member portal access.
- `ADMIN_SESSION_SECRET` (required): secret for signing admin session cookies.
  Falls back to `MEMBER_SESSION_SECRET`, but a separate value is better. Admin
  sessions last 8 hours.
- `DATABASE_URL` (required to save content): Neon Postgres connection string.
  Without it the portal is read-only and the site serves `src/data/*.json`.
- `UPLOADTHING_TOKEN` (optional): enables image uploads from the portal. Use
  the token from the UploadThing dashboard's API Keys tab, not the `sk_live_…`
  secret key — the secret key is one field inside the token and does not work on
  its own. The portal's Setup panel says so if the wrong value is set.
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
