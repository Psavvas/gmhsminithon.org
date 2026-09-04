/**
 * Neon (Postgres) connection used by the admin portal.
 *
 * The whole site works without a database: when no connection string is set,
 * content falls back to the JSON files in `src/data`. As soon as a Neon
 * connection string is present the tables are created on first use, so there is
 * no separate migration step to run.
 */
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { readFirstEnv } from "../env";

/**
 * Checked in order. Vercel's Neon integration sets several of these; the first
 * one present wins.
 */
const DATABASE_URL_ENV_KEYS = [
  "CONTENT_DATABASE_URL",
  "DATABASE_URL",
  "NEON_DATABASE_URL",
  "POSTGRES_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
];

export type Sql = NeonQueryFunction<false, false>;

let cachedConnectionString: string | undefined;
let cachedSql: Sql | undefined;
let schemaPromise: Promise<void> | undefined;

export function getDatabaseUrl(): string | undefined {
  return readFirstEnv(DATABASE_URL_ENV_KEYS);
}

export function isDatabaseConfigured(): boolean {
  return Boolean(getDatabaseUrl());
}

function getSql(): Sql | null {
  const connectionString = getDatabaseUrl();

  if (!connectionString) {
    return null;
  }

  if (!cachedSql || cachedConnectionString !== connectionString) {
    cachedSql = neon(connectionString);
    cachedConnectionString = connectionString;
    schemaPromise = undefined;
  }

  return cachedSql;
}

async function createSchema(sql: Sql): Promise<void> {
  await sql.transaction([
    sql`
      create table if not exists site_content (
        collection text primary key,
        data jsonb not null,
        updated_at timestamptz not null default now(),
        updated_by text
      )
    `,
    sql`
      create table if not exists admin_users (
        shoo_sub text primary key,
        label text,
        created_at timestamptz not null default now(),
        created_by text
      )
    `,
    sql`
      create table if not exists member_approvals (
        shoo_sub text primary key,
        label text,
        created_at timestamptz not null default now(),
        created_by text
      )
    `,
    sql`
      create table if not exists admin_activity_log (
        id bigserial primary key,
        created_at timestamptz not null default now(),
        actor text,
        action text not null,
        target text,
        details jsonb
      )
    `,
    sql`
      create index if not exists admin_activity_log_created_at_idx
        on admin_activity_log (created_at desc)
    `,
  ]);
}

function ensureSchema(sql: Sql): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = createSchema(sql).catch((error) => {
      // Let the next request try again instead of caching the failure.
      schemaPromise = undefined;
      throw error;
    });
  }

  return schemaPromise;
}

/**
 * Returns a ready-to-use query function, or null when no database is configured.
 * Throws if the database is configured but unreachable.
 */
export async function getDatabase(): Promise<Sql | null> {
  const sql = getSql();

  if (!sql) {
    return null;
  }

  await ensureSchema(sql);

  return sql;
}

export function describeDatabaseError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "The database could not be reached.";
}

export async function checkDatabaseConnection(): Promise<{
  configured: boolean;
  reachable: boolean;
  error?: string;
}> {
  if (!isDatabaseConfigured()) {
    return { configured: false, reachable: false };
  }

  try {
    const sql = await getDatabase();

    if (!sql) {
      return { configured: false, reachable: false };
    }

    await sql`select 1 as ok`;
    return { configured: true, reachable: true };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      error: describeDatabaseError(error),
    };
  }
}

/**
 * How long an activity log entry is kept. The privacy policy states this
 * number, so changing it here means changing it there too.
 */
export const ADMIN_ACTIVITY_LOG_RETENTION_MONTHS = 18;

/** At most one prune per warm instance per this interval. */
const ADMIN_ACTIVITY_LOG_PRUNE_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;

let adminActivityLogLastPrunedAt = 0;
let adminActivityLogPrunePromise: Promise<void> | undefined;

/**
 * Deletes entries past the retention window. Writes are rare, so piggybacking
 * on them is enough to keep the table bounded without a scheduled job — and
 * `getRecentAdminActivity` filters by the same window, so an entry is never
 * shown after it expires, even if no prune has run yet.
 */
async function pruneAdminActivityLog(sql: Sql): Promise<void> {
  await sql`
    delete from admin_activity_log
    where created_at < now() - make_interval(months => ${ADMIN_ACTIVITY_LOG_RETENTION_MONTHS})
  `;
}

function schedulePruneAdminActivityLog(sql: Sql): void {
  const now = Date.now();

  if (
    adminActivityLogPrunePromise ||
    now - adminActivityLogLastPrunedAt <
      ADMIN_ACTIVITY_LOG_PRUNE_MIN_INTERVAL_MS
  ) {
    return;
  }

  adminActivityLogLastPrunedAt = now;
  adminActivityLogPrunePromise = pruneAdminActivityLog(sql)
    .catch((error) => {
      // Left for the next window to retry. Expired rows are already hidden
      // from the portal, and a stuck prune must never fail an admin action.
      console.warn("[admin] activity log prune failed", {
        error: describeDatabaseError(error),
      });
    })
    .finally(() => {
      adminActivityLogPrunePromise = undefined;
    });
}

/**
 * Best-effort audit trail. A logging failure must never block the action that
 * triggered it.
 */
export async function logAdminActivity(entry: {
  actor: string;
  action: string;
  target?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const sql = await getDatabase();

    if (!sql) {
      return;
    }

    await sql`
      insert into admin_activity_log (actor, action, target, details)
      values (
        ${entry.actor},
        ${entry.action},
        ${entry.target ?? null},
        ${entry.details ? JSON.stringify(entry.details) : null}::jsonb
      )
    `;

    schedulePruneAdminActivityLog(sql);
  } catch (error) {
    console.warn("[admin] activity log write failed", {
      action: entry.action,
      error: describeDatabaseError(error),
    });
  }
}

export type AdminActivityEntry = {
  id: string;
  createdAt: string;
  actor: string | null;
  action: string;
  target: string | null;
};

export async function getRecentAdminActivity(
  limit = 12,
): Promise<AdminActivityEntry[]> {
  const sql = await getDatabase();

  if (!sql) {
    return [];
  }

  const rows = (await sql`
    select id, created_at, actor, action, target
    from admin_activity_log
    where created_at >= now() - make_interval(months => ${ADMIN_ACTIVITY_LOG_RETENTION_MONTHS})
    order by created_at desc
    limit ${Math.min(Math.max(limit, 1), 50)}
  `) as Array<{
    id: string | number;
    created_at: string | Date;
    actor: string | null;
    action: string;
    target: string | null;
  }>;

  return rows.map((row) => ({
    id: String(row.id),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    actor: row.actor,
    action: row.action,
    target: row.target,
  }));
}
