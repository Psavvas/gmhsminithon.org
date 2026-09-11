-- GMHS Mini-THON admin portal schema
--
-- The site creates these tables automatically the first time it talks to the
-- database, so running this by hand is optional. It is here for when you would
-- rather set them up yourself in the Neon SQL Editor, or want to see exactly
-- what the portal stores.
--
-- Safe to run more than once: every statement is "if not exists".
-- Keep this file in step with createSchema() in src/utils/content/db.ts.

-- One row per content section, holding that section's whole document.
-- `collection` matches the ids in src/utils/content/collections.ts:
-- fundraising, sponsors, events, clubInfo, redirects, memberAnnouncements,
-- memberResources, banners, siteSettings, memberSignup.
create table if not exists site_content (
  collection text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Shoo user IDs that can use the admin portal. IDs listed in the
-- ADMIN_APPROVED_SHOO_SUBS environment variable work regardless of this table
-- and cannot be removed from inside the portal.
create table if not exists admin_users (
  shoo_sub text primary key,
  label text,
  created_at timestamptz not null default now(),
  created_by text
);

-- Shoo user IDs approved for the member portal at /members. Merged with
-- MEMBER_APPROVED_SHOO_SUBS, the optional Google Sheet, and the admin list.
-- Rows with created_by = 'signup' approved themselves at /signup with the
-- access code from the memberSignup section.
create table if not exists member_approvals (
  shoo_sub text primary key,
  label text,
  created_at timestamptz not null default now(),
  created_by text
);

-- Audit trail shown as "Recent changes" on the admin overview. Entries are
-- kept for 18 months; the site prunes older rows as new ones are written
-- (see ADMIN_ACTIVITY_LOG_RETENTION_MONTHS in src/utils/content/db.ts).
create table if not exists admin_activity_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  actor text,
  action text not null,
  target text,
  details jsonb
);

create index if not exists admin_activity_log_created_at_idx
  on admin_activity_log (created_at desc);

-- ---------------------------------------------------------------------------
-- Handy queries
-- ---------------------------------------------------------------------------
--
-- Open member sign-ups at /signup with a code, without going through the admin
-- portal. Editing the "Member sign-up" section in the portal does exactly this.
--
--   insert into site_content (collection, data, updated_by)
--   values (
--     'memberSignup',
--     jsonb_build_object(
--       'enabled', true,
--       'accessCode', 'FTK-2026-SPRING',
--       'closedMessage', ''
--     ),
--     'neon-sql'
--   )
--   on conflict (collection) do update
--     set data = excluded.data,
--         updated_at = now(),
--         updated_by = excluded.updated_by;
--
-- Close sign-ups again, leaving the code in place:
--
--   update site_content
--   set data = jsonb_set(data, '{enabled}', 'false'::jsonb),
--       updated_at = now()
--   where collection = 'memberSignup';
--
-- Who has approved themselves with the code, newest first:
--
--   select shoo_sub, label, created_at
--   from member_approvals
--   where created_by = 'signup'
--   order by created_at desc;
--
-- Approve someone by hand (the same thing the admin portal's Shoo IDs page does):
--
--   insert into member_approvals (shoo_sub, label, created_by)
--   values ('THE-SHOO-ID', 'Added by hand', 'neon-sql')
--   on conflict (shoo_sub) do nothing;
