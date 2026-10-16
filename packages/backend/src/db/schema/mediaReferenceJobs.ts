import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { MEDIA_ENTITY_TYPES, type MediaEntityType } from '../../media/entities';
import { sqlInList } from '../sqlLiterals';

export const MEDIA_REFERENCE_JOB_STATUSES = ['pending', 'failed'] as const;
export type MediaReferenceJobStatus = (typeof MEDIA_REFERENCE_JOB_STATUSES)[number];

/**
 * The reference outbox: "bring Oxy's references for this entity in line with
 * what it uses now", written in the SAME transaction as the change to the
 * entity (an article edit, an ad booking, a deletion). The worker
 * (`media/referenceWorker.ts`) reads the entity's current files, diffs them
 * against `media_file_references`, and adds and removes the difference — so a
 * dropped image or a deleted article releases its files, and the order jobs run
 * in never matters.
 *
 * One pending job per entity: a change while one is pending bumps its
 * `generation`, and a worker that finishes an older generation leaves the job
 * pending for another pass rather than losing the newer change. A finished job
 * is deleted; one given up on stays `failed` (and is logged as an error).
 */
export const mediaReferenceJobs = pgTable(
  'media_reference_jobs',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    entityType: text().$type<MediaEntityType>().notNull(),
    entityId: text().notNull(),
    status: text().$type<MediaReferenceJobStatus>().notNull().default('pending'),
    generation: integer().notNull().default(0),
    attempts: integer().notNull().default(0),
    nextAttemptAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    lockedUntil: timestamp({ withTimezone: true, mode: 'date' }),
    lastError: text(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'media_reference_jobs_entity_type_check',
      sql`${t.entityType} IN ${sqlInList(MEDIA_ENTITY_TYPES)}`,
    ),
    check(
      'media_reference_jobs_status_check',
      sql`${t.status} IN ${sqlInList(MEDIA_REFERENCE_JOB_STATUSES)}`,
    ),
    uniqueIndex('media_reference_jobs_pending_entity_unique')
      .on(t.entityType, t.entityId)
      .where(sql`${t.status} = 'pending'`),
    index('media_reference_jobs_due_idx').on(t.nextAttemptAt).where(sql`${t.status} = 'pending'`),
  ],
);

export type MediaReferenceJobRow = typeof mediaReferenceJobs.$inferSelect;
