import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { sqlInList } from '../sqlLiterals';

/**
 * What an object of the legacy bucket was:
 * - `image`: an image GWJ stored (an upload, an import, an ad creative);
 * - `rendition`: a `srcset` rendition GWJ made beside an image
 *   (`<key-without-ext>.w<width>.webp`) — not copied: Oxy renders its own, and
 *   the object maps to its image's file at the nearest Oxy rendition;
 * - `social_card`: a generated Instagram card (`social-cards/…`);
 * - `writer_portrait`: a roster writer's portrait (`writers/<username>.png`).
 */
export const LEGACY_MEDIA_KINDS = ['image', 'rendition', 'social_card', 'writer_portrait'] as const;
export type LegacyMediaKind = (typeof LEGACY_MEDIA_KINDS)[number];

/**
 * Per object: `pending` (inventoried), `copied` (in Oxy, its SHA-256 verified
 * equal to the bucket's bytes), `mapped` (a rendition, resolved through its
 * image), `failed` (`error` says why; a re-run tries again).
 */
export const LEGACY_MEDIA_STATUSES = ['pending', 'copied', 'mapped', 'failed'] as const;
export type LegacyMediaStatus = (typeof LEGACY_MEDIA_STATUSES)[number];

/**
 * Every object of the legacy `gwj-media` bucket and where it went in Oxy Files:
 * the migration's resumable state (`media/legacyMigration.ts`) and, after the
 * bucket is retired, the only map from an old CDN URL (in a sent newsletter, a
 * federated post) to its Oxy file — `GET /legacy-media/<key>` redirects by it.
 * Reports name a row by `id` and `sha256`, never by key or URL.
 */
export const legacyMediaObjects = pgTable(
  'legacy_media_objects',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    key: text().notNull(),
    kind: text().$type<LegacyMediaKind>().notNull(),
    /** A rendition's image (its key), when the bucket holds it. */
    imageKey: text(),
    /** A rendition's width in pixels. */
    renditionWidth: integer(),
    size: bigint({ mode: 'number' }).notNull(),
    etag: text(),
    contentType: text(),
    /** SHA-256 of the bucket's bytes, once read. */
    sha256: text(),
    oxyFileId: text(),
    status: text().$type<LegacyMediaStatus>().notNull().default('pending'),
    error: text(),
    attempts: integer().notNull().default(0),
    copiedAt: timestamp({ withTimezone: true, mode: 'date' }),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    unique('legacy_media_objects_key_unique').on(t.key),
    check('legacy_media_objects_kind_check', sql`${t.kind} IN ${sqlInList(LEGACY_MEDIA_KINDS)}`),
    check(
      'legacy_media_objects_status_check',
      sql`${t.status} IN ${sqlInList(LEGACY_MEDIA_STATUSES)}`,
    ),
    check(
      'legacy_media_objects_copied_check',
      sql`${t.status} NOT IN ('copied', 'mapped') OR ${t.oxyFileId} IS NOT NULL`,
    ),
    index('legacy_media_objects_status_idx').on(t.status, t.id),
  ],
);

export type LegacyMediaObjectRow = typeof legacyMediaObjects.$inferSelect;
export type NewLegacyMediaObjectRow = typeof legacyMediaObjects.$inferInsert;
