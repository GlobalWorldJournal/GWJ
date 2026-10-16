import { sql } from 'drizzle-orm';
import { integer, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import type { ImageVariant } from '@gwj/shared-types';

/**
 * Every image GWJ stores: its size, its renditions for `srcset`, and — since
 * the move to Oxy Files — the GWJ-application-owned Oxy file that holds it. An
 * article's hero image is matched here by URL to fill in that metadata, so
 * agents only ever pass the URL. One row per stored file: storing the same
 * bytes again answers the same Oxy file (Oxy dedupes per owner), and so the
 * same row. `sha256` is of the bytes Oxy stored (on a row from before the move,
 * of the bytes as submitted, until the migration copies it).
 *
 * `oxyFileId` is null only on a row recorded before the move whose object is
 * still in the legacy bucket (see `legacy_media_objects`); the migration fills
 * it. `uploadedBy` is the audit of who first stored the bytes (`user:<id>`,
 * `agent:<name>`, `advertiser:<id>`, `system:<what>`; null on rows that predate
 * it). The file itself belongs to GWJ, never to that person.
 */
export const mediaAssets = pgTable(
  'media_assets',
  {
    url: text().primaryKey(),
    sha256: text().notNull(),
    width: integer(),
    height: integer(),
    variants: jsonb().$type<ImageVariant[]>().notNull().default(sql`'[]'::jsonb`),
    oxyFileId: text(),
    mime: text(),
    uploadedBy: text(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [unique('media_assets_oxy_file_id_unique').on(t.oxyFileId)],
);

export type MediaAssetRow = typeof mediaAssets.$inferSelect;
export type NewMediaAssetRow = typeof mediaAssets.$inferInsert;
