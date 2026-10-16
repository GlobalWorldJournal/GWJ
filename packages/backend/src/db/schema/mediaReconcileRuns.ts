import { sql } from 'drizzle-orm';
import { check, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { MEDIA_ENTITY_TYPES, type MediaEntityType } from '../../media/entities';
import { sqlInList } from '../sqlLiterals';

/** What one reconciliation reported (Oxy's counts, ADR 0041 D6). */
export interface MediaReconcileResult {
  added: number;
  removed: number;
  unchanged: number;
  refused: number;
  inventory: number;
}

/**
 * The nightly reconciliation of GWJ's references with Oxy, one row per entity
 * type: a lease (`lockedUntil`) so exactly one backend task runs it, when it
 * last finished, and what it found. A non-zero `added` or `removed` means a
 * reference write was missed (and is now repaired) — worth a look.
 */
export const mediaReconcileRuns = pgTable(
  'media_reconcile_runs',
  {
    entityType: text().$type<MediaEntityType>().primaryKey(),
    lockedUntil: timestamp({ withTimezone: true, mode: 'date' }),
    startedAt: timestamp({ withTimezone: true, mode: 'date' }),
    finishedAt: timestamp({ withTimezone: true, mode: 'date' }),
    result: jsonb().$type<MediaReconcileResult>(),
    lastError: text(),
  },
  (t) => [
    check(
      'media_reconcile_runs_entity_type_check',
      sql`${t.entityType} IN ${sqlInList(MEDIA_ENTITY_TYPES)}`,
    ),
  ],
);

export type MediaReconcileRunRow = typeof mediaReconcileRuns.$inferSelect;
