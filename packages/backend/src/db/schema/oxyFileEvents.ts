import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Every file event Oxy delivered (ADR 0041 D9), once: the dedupe key of an
 * at-least-once delivery AND the audit of why an image left (or came back to)
 * GWJ's pages — what happened (`type`, the file's resulting status and
 * visibility), to which file, which of GWJ's records used it (`references`),
 * when Oxy says it happened and when GWJ heard of it, and whether it changed
 * the recorded state (`outcome`: `applied`, or `superseded` by a newer event
 * already applied). Takedowns come from Oxy's staff review (D10); the event
 * never names the claimant.
 */
export const oxyFileEvents = pgTable(
  'oxy_file_events',
  {
    eventId: text().primaryKey(),
    type: text().notNull(),
    fileId: text().notNull(),
    fileStatus: text().notNull(),
    fileVisibility: text().notNull(),
    references: jsonb().$type<Array<{ entityType: string; entityId: string }>>().notNull(),
    outcome: text().notNull(),
    occurredAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
    receivedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('oxy_file_events_file_idx').on(t.fileId, t.occurredAt.desc())],
);

export type OxyFileEventRow = typeof oxyFileEvents.$inferSelect;
