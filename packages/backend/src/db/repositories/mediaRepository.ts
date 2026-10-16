import { eq, sql } from 'drizzle-orm';
import { getDb } from '../client';
import { mediaAssets, type MediaAssetRow, type NewMediaAssetRow } from '../schema/mediaAssets';

export async function findMediaByUrl(url: string): Promise<MediaAssetRow | null> {
  const [row] = await getDb().select().from(mediaAssets).where(eq(mediaAssets.url, url));
  return row ?? null;
}

/**
 * Record a stored file. The same file stored again (Oxy answers the same file
 * for the same bytes) refreshes what is known about it and keeps the audit of
 * who stored it FIRST.
 */
export async function recordMedia(row: NewMediaAssetRow): Promise<MediaAssetRow> {
  const [stored] = await getDb()
    .insert(mediaAssets)
    .values(row)
    .onConflictDoUpdate({
      target: mediaAssets.url,
      set: {
        sha256: sql`excluded.sha256`,
        oxyFileId: sql`excluded.oxy_file_id`,
        width: sql`coalesce(excluded.width, ${mediaAssets.width})`,
        height: sql`coalesce(excluded.height, ${mediaAssets.height})`,
        mime: sql`coalesce(excluded.mime, ${mediaAssets.mime})`,
        variants: sql`excluded.variants`,
        uploadedBy: sql`coalesce(${mediaAssets.uploadedBy}, excluded.uploaded_by)`,
      },
    })
    .returning();
  if (!stored) throw new Error('insert into media_assets returned no row');
  return stored;
}
