import { sql } from 'drizzle-orm';
import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { ImageVariant } from '@gwj/shared-types';

/**
 * Every image stored on our CDN through an upload: its size and the narrower
 * renditions made for `srcset`. An article's hero image is matched here by URL
 * to fill in that metadata, so agents only ever pass the URL. `sha256` (of the
 * bytes as submitted) makes re-uploading the same photo return the stored one.
 */
export const mediaAssets = pgTable('media_assets', {
  url: text().primaryKey(),
  sha256: text().notNull().unique(),
  width: integer(),
  height: integer(),
  variants: jsonb().$type<ImageVariant[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type MediaAssetRow = typeof mediaAssets.$inferSelect;
export type NewMediaAssetRow = typeof mediaAssets.$inferInsert;
