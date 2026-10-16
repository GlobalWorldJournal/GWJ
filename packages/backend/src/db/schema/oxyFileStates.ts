import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { sqlInList } from '../sqlLiterals';

export const OXY_FILE_STATUSES = ['active', 'trash', 'blocked', 'deleted'] as const;
export type OxyFileStatus = (typeof OXY_FILE_STATUSES)[number];
export const OXY_FILE_VISIBILITIES = ['public', 'unlisted', 'private'] as const;
export type OxyFileVisibility = (typeof OXY_FILE_VISIBILITIES)[number];

/**
 * The last state Oxy told GWJ a file is in (ADR 0041 D9), per file. Only files
 * an event was received for have a row. A file GWJ shows is HIDDEN from readers
 * while its state is anything but `active` and readable by link (a takedown
 * `blocked`, `trash`, `deleted`, or made `private` by its owner) — Oxy serves
 * none of those, so showing it would show a broken image. Written only by the
 * file-events receiver, newest `occurredAt` wins (delivery is at least once and
 * unordered).
 */
export const oxyFileStates = pgTable(
  'oxy_file_states',
  {
    fileId: text().primaryKey(),
    status: text().$type<OxyFileStatus>().notNull(),
    visibility: text().$type<OxyFileVisibility>().notNull(),
    /** When the change happened at Oxy. */
    occurredAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
    /** The event that set this state (`oxy_file_events.event_id`). */
    eventId: text().notNull(),
    updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    check('oxy_file_states_status_check', sql`${t.status} IN ${sqlInList(OXY_FILE_STATUSES)}`),
    check(
      'oxy_file_states_visibility_check',
      sql`${t.visibility} IN ${sqlInList(OXY_FILE_VISIBILITIES)}`,
    ),
    index('oxy_file_states_hidden_idx')
      .on(t.fileId)
      .where(sql`${t.status} <> 'active' OR ${t.visibility} = 'private'`),
  ],
);

export type OxyFileStateRow = typeof oxyFileStates.$inferSelect;
