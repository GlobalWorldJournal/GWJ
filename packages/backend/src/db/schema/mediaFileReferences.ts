import { sql } from 'drizzle-orm';
import { check, index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { MEDIA_ENTITY_TYPES, type MediaEntityType } from '../../media/entities';
import { sqlInList } from '../sqlLiterals';

/**
 * The references GWJ has registered with Oxy Files (ADR 0041 D4): which of
 * GWJ's records uses which Oxy file. A mirror of what Oxy holds for the GWJ
 * application, so the reference worker can tell what an entity STOPPED using —
 * the content itself only says what it uses now. The nightly reconciliation
 * (D6) rebuilds it from the content.
 */
export const mediaFileReferences = pgTable(
  'media_file_references',
  {
    entityType: text().$type<MediaEntityType>().notNull(),
    entityId: text().notNull(),
    fileId: text().notNull(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({
      name: 'media_file_references_pkey',
      columns: [t.entityType, t.entityId, t.fileId],
    }),
    check(
      'media_file_references_entity_type_check',
      sql`${t.entityType} IN ${sqlInList(MEDIA_ENTITY_TYPES)}`,
    ),
    index('media_file_references_file_idx').on(t.fileId),
  ],
);

export type MediaFileReferenceRow = typeof mediaFileReferences.$inferSelect;
