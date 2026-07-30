/**
 * Who may use the admin portal, and who may use the member portal.
 *
 * Both lists live in the database so they can be edited from the admin portal.
 * Environment variables act as a bootstrap that the database cannot override —
 * that is what stops an admin from accidentally locking everyone out.
 */
import { readEnv, stripSurroundingQuotes } from "../env";
import {
  describeDatabaseError,
  getDatabase,
  isDatabaseConfigured,
  logAdminActivity,
} from "../content/db";

const SNAPSHOT_FRESH_MS = 20_000;
const SNAPSHOT_STALE_MAX_MS = 5 * 60 * 1000;
const SHOO_ID_PATTERN = /^[A-Za-z0-9._:@|-]{4,200}$/;

export type AccessListId = "admins" | "members";

export type AccessEntry = {
  shooSub: string;
  label: string | null;
  createdAt: string | null;
  createdBy: string | null;
  /** Environment entries are read-only in the portal. */
  origin: "environment" | "database";
};

export type AccessListState = {
  id: AccessListId;
  subjects: ReadonlySet<string>;
  entries: AccessEntry[];
  databaseConfigured: boolean;
  cacheStatus: "fresh" | "stale" | "missing";
  error?: string;
};

type AccessSnapshot = {
  entries: AccessEntry[];
  fetchedAt: number;
};

const snapshots = new Map<AccessListId, AccessSnapshot>();
const inflight = new Map<AccessListId, Promise<AccessSnapshot>>();

const ENV_KEYS: Record<AccessListId, string[]> = {
  admins: ["ADMIN_APPROVED_SHOO_SUBS"],
  members: ["MEMBER_APPROVED_SHOO_SUBS"],
};

export function parseShooSubList(rawValue?: string): string[] {
  if (!rawValue) {
    return [];
  }

  return Array.from(
    new Set(
      rawValue
        .split(/[\s,;]+/)
        // Tolerate quotes and brackets left over from copy/paste.
        .map((value) =>
          stripSurroundingQuotes(value.trim()).replace(
            /^["'[\]]+|["'[\]]+$/g,
            "",
          ),
        )
        .filter(Boolean),
    ),
  );
}

function getEnvSubjects(listId: AccessListId): string[] {
  for (const key of ENV_KEYS[listId]) {
    const parsed = parseShooSubList(readEnv(key));

    if (parsed.length > 0) {
      return parsed;
    }
  }

  return [];
}

export function normalizeShooSub(rawValue: unknown): string {
  return typeof rawValue === "string" ? rawValue.trim() : "";
}

export function isValidShooSub(value: string): boolean {
  return SHOO_ID_PATTERN.test(value);
}

type AccessRow = {
  shoo_sub: string;
  label: string | null;
  created_at: string | Date | null;
  created_by: string | null;
};

function toEntries(rows: AccessRow[]): AccessEntry[] {
  return rows.map((row) => ({
    shooSub: row.shoo_sub,
    label: row.label,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at
          ? String(row.created_at)
          : null,
    createdBy: row.created_by,
    origin: "database" as const,
  }));
}

async function fetchAccessRows(listId: AccessListId): Promise<AccessEntry[]> {
  const sql = await getDatabase();

  if (!sql) {
    return [];
  }

  // Table names cannot be parameterized, so each list uses its own literal query.
  const rows =
    listId === "admins"
      ? ((await sql`
          select shoo_sub, label, created_at, created_by
          from admin_users
          order by created_at asc
        `) as AccessRow[])
      : ((await sql`
          select shoo_sub, label, created_at, created_by
          from member_approvals
          order by created_at asc
        `) as AccessRow[]);

  return toEntries(rows);
}

async function getAccessSnapshot(
  listId: AccessListId,
  options: { forceRefresh?: boolean; waitForRefresh?: boolean } = {},
): Promise<{ snapshot: AccessSnapshot | undefined; error?: string }> {
  if (!isDatabaseConfigured()) {
    return { snapshot: { entries: [], fetchedAt: Date.now() } };
  }

  const cached = snapshots.get(listId);
  const now = Date.now();
  const isFresh = cached && now - cached.fetchedAt < SNAPSHOT_FRESH_MS;

  if (isFresh && !options.forceRefresh) {
    return { snapshot: cached };
  }

  const existingRequest = inflight.get(listId);

  if (existingRequest && !options.forceRefresh) {
    try {
      return { snapshot: await existingRequest };
    } catch (error) {
      return { snapshot: cached, error: describeDatabaseError(error) };
    }
  }

  const request = fetchAccessRows(listId)
    .then((entries) => {
      const snapshot = { entries, fetchedAt: Date.now() };
      snapshots.set(listId, snapshot);
      return snapshot;
    })
    .finally(() => {
      inflight.delete(listId);
    });

  inflight.set(listId, request);

  try {
    return { snapshot: await request };
  } catch (error) {
    const message = describeDatabaseError(error);
    console.warn("[admin] access list read failed", { listId, error: message });

    if (cached && Date.now() - cached.fetchedAt < SNAPSHOT_STALE_MAX_MS) {
      return { snapshot: cached, error: message };
    }

    return { snapshot: undefined, error: message };
  }
}

export function invalidateAccessCache(listId?: AccessListId): void {
  if (listId) {
    snapshots.delete(listId);
    return;
  }

  snapshots.clear();
}

export async function getAccessListState(
  listId: AccessListId,
  options: { forceRefresh?: boolean } = {},
): Promise<AccessListState> {
  const envSubjects = getEnvSubjects(listId);
  const { snapshot, error } = await getAccessSnapshot(listId, options);
  const databaseEntries = snapshot?.entries ?? [];
  const subjects = new Set<string>(envSubjects);

  for (const entry of databaseEntries) {
    subjects.add(entry.shooSub);
  }

  const entries: AccessEntry[] = [
    ...envSubjects.map((shooSub) => ({
      shooSub,
      label: null,
      createdAt: null,
      createdBy: null,
      origin: "environment" as const,
    })),
    // A database row for an environment ID adds nothing, so hide the duplicate.
    ...databaseEntries.filter((entry) => !envSubjects.includes(entry.shooSub)),
  ];

  const cacheStatus: AccessListState["cacheStatus"] = !isDatabaseConfigured()
    ? "fresh"
    : !snapshot
      ? "missing"
      : Date.now() - snapshot.fetchedAt < SNAPSHOT_FRESH_MS
        ? "fresh"
        : "stale";

  return {
    id: listId,
    subjects,
    entries,
    databaseConfigured: isDatabaseConfigured(),
    cacheStatus,
    error,
  };
}

export async function isAdminSubject(pairwiseSub: string): Promise<boolean> {
  if (!pairwiseSub) {
    return false;
  }

  const state = await getAccessListState("admins");

  if (state.subjects.has(pairwiseSub)) {
    return true;
  }

  // A freshly added admin may not be in this instance's cache yet.
  if (state.databaseConfigured && state.cacheStatus !== "fresh") {
    const refreshed = await getAccessListState("admins", {
      forceRefresh: true,
    });
    return refreshed.subjects.has(pairwiseSub);
  }

  return false;
}

export function hasAdminBootstrapConfigured(): boolean {
  return getEnvSubjects("admins").length > 0;
}

/**
 * Member Shoo IDs stored in the database, merged into the member allowlist by
 * `src/utils/auth.ts` alongside the environment variable and Google Sheet.
 */
export async function getDatabaseMemberSubjectsState(
  options: { forceRefresh?: boolean } = {},
): Promise<{
  configured: boolean;
  subjects: ReadonlySet<string>;
  cacheStatus: AccessListState["cacheStatus"];
  error?: string;
}> {
  if (!isDatabaseConfigured()) {
    return { configured: false, subjects: new Set(), cacheStatus: "fresh" };
  }

  const { snapshot, error } = await getAccessSnapshot("members", options);

  return {
    configured: true,
    subjects: new Set((snapshot?.entries ?? []).map((entry) => entry.shooSub)),
    cacheStatus: !snapshot
      ? "missing"
      : Date.now() - snapshot.fetchedAt < SNAPSHOT_FRESH_MS
        ? "fresh"
        : "stale",
    // A recent snapshot keeps member sign-in working through a database
    // hiccup; only report an error when there is nothing to fall back on.
    error: snapshot ? undefined : error,
  };
}

export type AccessFailure = { ok: false; status: number; error: string };

export type AccessMutationResult =
  | { ok: true; entry: AccessEntry }
  | AccessFailure;

export type AccessRemovalResult = { ok: true; removed: string } | AccessFailure;

export async function addAccessEntry(
  listId: AccessListId,
  input: { shooSub: unknown; label?: unknown },
  actor: string,
): Promise<AccessMutationResult> {
  const shooSub = normalizeShooSub(input.shooSub);
  const label = typeof input.label === "string" ? input.label.trim() : "";

  if (!shooSub) {
    return { ok: false, status: 400, error: "Enter a Shoo user ID." };
  }

  if (!isValidShooSub(shooSub)) {
    return {
      ok: false,
      status: 400,
      error:
        "That does not look like a Shoo user ID. Copy the ID exactly as it is shown on the login screen.",
    };
  }

  if (label.length > 120) {
    return {
      ok: false,
      status: 400,
      error: "Keep the note under 120 characters.",
    };
  }

  const sql = await getDatabase();

  if (!sql) {
    return {
      ok: false,
      status: 503,
      error:
        "No database is connected yet, so this list cannot be edited from the portal.",
    };
  }

  const labelValue = label || null;
  const rows =
    listId === "admins"
      ? ((await sql`
          insert into admin_users (shoo_sub, label, created_by)
          values (${shooSub}, ${labelValue}, ${actor})
          on conflict (shoo_sub) do update
            set label = coalesce(excluded.label, admin_users.label)
          returning shoo_sub, label, created_at, created_by
        `) as AccessRow[])
      : ((await sql`
          insert into member_approvals (shoo_sub, label, created_by)
          values (${shooSub}, ${labelValue}, ${actor})
          on conflict (shoo_sub) do update
            set label = coalesce(excluded.label, member_approvals.label)
          returning shoo_sub, label, created_at, created_by
        `) as AccessRow[]);

  invalidateAccessCache(listId);

  await logAdminActivity({
    actor,
    action: listId === "admins" ? "access.admin_added" : "access.member_added",
    target: shooSub,
    details: label ? { label } : undefined,
  });

  return { ok: true, entry: toEntries(rows)[0] };
}

export async function removeAccessEntry(
  listId: AccessListId,
  input: { shooSub: unknown },
  actor: string,
): Promise<AccessRemovalResult> {
  const shooSub = normalizeShooSub(input.shooSub);

  if (!shooSub) {
    return { ok: false, status: 400, error: "Missing Shoo user ID." };
  }

  if (listId === "admins" && shooSub === actor) {
    return {
      ok: false,
      status: 400,
      error:
        "You cannot remove your own admin access. Ask another admin to do it.",
    };
  }

  if (getEnvSubjects(listId).includes(shooSub)) {
    return {
      ok: false,
      status: 400,
      error:
        "This ID comes from an environment variable in Vercel and has to be removed there.",
    };
  }

  const sql = await getDatabase();

  if (!sql) {
    return {
      ok: false,
      status: 503,
      error:
        "No database is connected yet, so this list cannot be edited from the portal.",
    };
  }

  if (listId === "admins") {
    await sql`delete from admin_users where shoo_sub = ${shooSub}`;
  } else {
    await sql`delete from member_approvals where shoo_sub = ${shooSub}`;
  }

  invalidateAccessCache(listId);

  await logAdminActivity({
    actor,
    action:
      listId === "admins" ? "access.admin_removed" : "access.member_removed",
    target: shooSub,
  });

  return { ok: true, removed: shooSub };
}
