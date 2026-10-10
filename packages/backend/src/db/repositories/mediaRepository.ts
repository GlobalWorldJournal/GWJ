import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import { mediaAssets, type MediaAssetRow, type NewMediaAssetRow } from '../schema/mediaAssets';

export async function findMediaBySha256(sha256: string): Promise<MediaAssetRow | null> {
  const [row] = await getDb().select().from(mediaAssets).where(eq(mediaAssets.sha256, sha256));
  return row ?? null;
}

export async function findMediaByUrl(url: string): Promise<MediaAssetRow | null> {
  const [row] = await getDb().select().from(mediaAssets).where(eq(mediaAssets.url, url));
  return row ?? null;
}

/**
 * Record an upload. Two concurrent uploads of the same bytes both reach here:
 * the first row wins and both callers get it (the loser's objects are simply
 * unused).
 */
export async function recordMedia(row: NewMediaAssetRow): Promise<MediaAssetRow> {
  const [inserted] = await getDb()
    .insert(mediaAssets)
    .values(row)
    .onConflictDoNothing({ target: mediaAssets.sha256 })
    .returning();
  if (inserted) return inserted;
  const existing = await findMediaBySha256(row.sha256);
  if (!existing) throw new Error(`media asset ${row.sha256} vanished after a conflicting insert`);
  return existing;
}
