/**
 * Reads and writes managed site content.
 *
 * Storage order:
 *   1. Neon/Postgres, when a connection string is configured (admin-editable).
 *   2. The JSON files in `src/data`, which ship with the repository.
 *
 * Reads are cached in memory for a few seconds so a page render never makes more
 * than one database round trip, and a stale snapshot is served if the database
 * has a hiccup.
 */
import {
  getCollectionDefaults,
  getCollectionSpec,
  normalizeCollection,
  type CollectionSpec,
} from "./collections";
import {
  describeDatabaseError,
  getDatabase,
  isDatabaseConfigured,
  logAdminActivity,
} from "./db";

const SNAPSHOT_FRESH_MS = 20_000;
const SNAPSHOT_STALE_MAX_MS = 5 * 60 * 1000;

export type ContentSource = "database" | "bundled";

export type ContentRecord = {
  collection: string;
  data: unknown;
  updatedAt: string | null;
  updatedBy: string | null;
};

type ContentSnapshot = {
  records: Map<string, ContentRecord>;
  source: ContentSource;
  fetchedAt: number;
  error?: string;
};

let cachedSnapshot: ContentSnapshot | undefined;
let inflightSnapshot: Promise<ContentSnapshot> | undefined;

const BUNDLED_SNAPSHOT: ContentSnapshot = {
  records: new Map(),
  source: "bundled",
  fetchedAt: 0,
};

function toIsoString(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" && value) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }

  return null;
}

/**
 * `jsonb` columns come back as parsed objects, but tolerate a driver that hands
 * back the raw JSON text rather than silently rendering an empty section.
 */
function parseStoredData(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function loadSnapshotFromDatabase(): Promise<ContentSnapshot> {
  const sql = await getDatabase();

  if (!sql) {
    return { ...BUNDLED_SNAPSHOT, fetchedAt: Date.now() };
  }

  const rows = (await sql`
    select collection, data, updated_at, updated_by
    from site_content
  `) as Array<{
    collection: string;
    data: unknown;
    updated_at: string | Date | null;
    updated_by: string | null;
  }>;

  const records = new Map<string, ContentRecord>();

  for (const row of rows) {
    records.set(row.collection, {
      collection: row.collection,
      data: parseStoredData(row.data),
      updatedAt: toIsoString(row.updated_at),
      updatedBy: row.updated_by,
    });
  }

  return {
    records,
    source: "database",
    fetchedAt: Date.now(),
  };
}

export async function getContentSnapshot(
  options: { forceRefresh?: boolean } = {},
): Promise<ContentSnapshot> {
  if (!isDatabaseConfigured()) {
    return { ...BUNDLED_SNAPSHOT, fetchedAt: Date.now() };
  }

  const now = Date.now();
  const isFresh =
    cachedSnapshot && now - cachedSnapshot.fetchedAt < SNAPSHOT_FRESH_MS;

  if (isFresh && !options.forceRefresh) {
    return cachedSnapshot as ContentSnapshot;
  }

  if (inflightSnapshot) {
    return inflightSnapshot;
  }

  inflightSnapshot = loadSnapshotFromDatabase()
    .then((snapshot) => {
      cachedSnapshot = snapshot;
      return snapshot;
    })
    .catch((error) => {
      const message = describeDatabaseError(error);
      console.warn("[admin] content read failed", { error: message });

      // Keep the site up: serve the last known content, or the bundled files.
      if (
        cachedSnapshot &&
        Date.now() - cachedSnapshot.fetchedAt < SNAPSHOT_STALE_MAX_MS
      ) {
        return { ...cachedSnapshot, error: message };
      }

      return {
        ...BUNDLED_SNAPSHOT,
        fetchedAt: Date.now(),
        error: message,
      };
    })
    .finally(() => {
      inflightSnapshot = undefined;
    });

  return inflightSnapshot;
}

export function invalidateContentCache(): void {
  cachedSnapshot = undefined;
}

export type CollectionRead<T = unknown> = {
  data: T;
  source: ContentSource;
  updatedAt: string | null;
  updatedBy: string | null;
  error?: string;
};

/**
 * Read one collection, normalized against its schema. Collections that have
 * never been saved fall back to the bundled JSON.
 */
export async function readCollection<T = unknown>(
  collectionId: string,
  options: { forceRefresh?: boolean } = {},
): Promise<CollectionRead<T>> {
  const spec = getCollectionSpec(collectionId);

  if (!spec) {
    throw new Error(`Unknown content collection: ${collectionId}`);
  }

  const snapshot = await getContentSnapshot(options);
  const record = snapshot.records.get(collectionId);

  // No stored row, or a stored row we could not read: serve the JSON that ships
  // with the site rather than an empty page.
  if (!record || record.data === null || record.data === undefined) {
    return {
      data: getCollectionDefaults(collectionId) as T,
      source: "bundled",
      updatedAt: null,
      updatedBy: null,
      error: snapshot.error,
    };
  }

  return {
    data: normalizeCollection(spec, record.data) as T,
    source: snapshot.source,
    updatedAt: record.updatedAt,
    updatedBy: record.updatedBy,
    error: snapshot.error,
  };
}

/**
 * Convenience read for page rendering, where only the content itself matters.
 */
export async function readCollectionData<T = unknown>(
  collectionId: string,
): Promise<T> {
  const { data } = await readCollection<T>(collectionId);
  return data;
}

export type WriteResult = {
  updatedAt: string;
  data: unknown;
};

export async function writeCollection(
  spec: CollectionSpec,
  data: unknown,
  actor: string,
): Promise<WriteResult> {
  const sql = await getDatabase();

  if (!sql) {
    throw new Error(
      "No database is connected yet, so content changes cannot be saved.",
    );
  }

  const rows = (await sql`
    insert into site_content (collection, data, updated_at, updated_by)
    values (${spec.id}, ${JSON.stringify(data)}::jsonb, now(), ${actor})
    on conflict (collection) do update
      set data = excluded.data,
          updated_at = now(),
          updated_by = excluded.updated_by
    returning updated_at
  `) as Array<{ updated_at: string | Date }>;

  const updatedAt =
    toIsoString(rows[0]?.updated_at) ?? new Date().toISOString();

  // Reflect the write immediately instead of waiting for the cache to expire.
  const records = new Map(cachedSnapshot?.records ?? []);
  records.set(spec.id, {
    collection: spec.id,
    data,
    updatedAt,
    updatedBy: actor,
  });
  cachedSnapshot = {
    records,
    source: "database",
    fetchedAt: Date.now(),
  };

  await logAdminActivity({
    actor,
    action: "content.update",
    target: spec.id,
  });

  return { updatedAt, data };
}

/**
 * Delete the stored copy of a collection, reverting the site to the JSON file
 * that ships with the repository.
 */
export async function resetCollection(
  spec: CollectionSpec,
  actor: string,
): Promise<void> {
  const sql = await getDatabase();

  if (!sql) {
    throw new Error("No database is connected yet.");
  }

  await sql`delete from site_content where collection = ${spec.id}`;

  const records = new Map(cachedSnapshot?.records ?? []);
  records.delete(spec.id);
  cachedSnapshot = {
    records,
    source: "database",
    fetchedAt: Date.now(),
  };

  await logAdminActivity({
    actor,
    action: "content.reset",
    target: spec.id,
  });
}

export type CollectionStatus = {
  id: string;
  label: string;
  description: string;
  icon: string;
  scope: CollectionSpec["scope"];
  previewPath?: string;
  source: ContentSource;
  updatedAt: string | null;
  updatedBy: string | null;
};

export async function getCollectionStatuses(
  specs: CollectionSpec[],
): Promise<{ statuses: CollectionStatus[]; error?: string }> {
  const snapshot = await getContentSnapshot();

  return {
    error: snapshot.error,
    statuses: specs.map((spec) => {
      const record = snapshot.records.get(spec.id);

      return {
        id: spec.id,
        label: spec.label,
        description: spec.description,
        icon: spec.icon,
        scope: spec.scope,
        previewPath: spec.previewPath,
        source: record ? snapshot.source : "bundled",
        updatedAt: record?.updatedAt ?? null,
        updatedBy: record?.updatedBy ?? null,
      };
    }),
  };
}
