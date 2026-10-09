import { randomUUID } from "node:crypto";
import { getDatabase } from "./db";
import type { DonorDriveCacheStore, DonorDriveSnapshot } from "../donorDrive";

type CacheRow = {
  total: number | null;
  refreshed_at: string | Date | null;
  next_refresh_at: string | Date;
};

function snapshot(row?: CacheRow): DonorDriveSnapshot {
  return {
    total: row?.total ?? null,
    refreshedAt: row?.refreshed_at
      ? new Date(row.refreshed_at).getTime()
      : null,
    nextRefreshAt: row ? new Date(row.next_refresh_at).getTime() || 0 : 0,
  };
}

/** One durable campaign cache and an atomic refresh lease across cold starts. */
export async function getDonorDriveCacheStore(): Promise<DonorDriveCacheStore | null> {
  const sql = await getDatabase();
  if (!sql) return null;

  return {
    async read() {
      const rows = await sql`
        select total, refreshed_at, next_refresh_at
        from donor_drive_cache where campaign = 'gmhsmt'
      `;
      return snapshot(rows[0] as CacheRow | undefined);
    },
    async claimRefresh(force) {
      const token = randomUUID();
      const rows = await sql`
        insert into donor_drive_cache (campaign, next_refresh_at, lease_token, lease_until)
        values ('gmhsmt', now() + interval '30 minutes', ${token}, now() + interval '30 seconds')
        on conflict (campaign) do update
          set next_refresh_at = excluded.next_refresh_at,
              lease_token = excluded.lease_token,
              lease_until = excluded.lease_until
          where donor_drive_cache.lease_until <= now()
            and (${force} or donor_drive_cache.next_refresh_at <= now())
        returning lease_token
      `;
      return rows.length ? token : null;
    },
    async completeRefresh(token, total) {
      const rows = await sql`
        update donor_drive_cache
        set total = ${total}, refreshed_at = now(),
            next_refresh_at = now() + interval '30 minutes',
            lease_token = null, lease_until = now()
        where campaign = 'gmhsmt' and lease_token = ${token}
        returning total, refreshed_at, next_refresh_at
      `;
      if (!rows.length)
        throw new Error("The DonorDrive refresh expired. Please try again.");
      return snapshot(rows[0] as CacheRow);
    },
    async failRefresh(token) {
      await sql`
        update donor_drive_cache set lease_token = null, lease_until = now()
        where campaign = 'gmhsmt' and lease_token = ${token}
      `;
    },
  };
}
