import { sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import {
  TakedownClaimTypeSchema,
  TakedownStatusSchema,
  type TakedownClaimType,
  type TakedownStatus,
} from '@gwj/shared-types';
import { RECORD_ID_SQL_PATTERN } from '../ids';
import { sqlInList } from '../sqlLiterals';

/**
 * Notice-and-takedown requests (public submission, admin review).
 *
 * `articleId` is the article the submitted URL(s) resolved to at submission time.
 * Deliberately NO foreign key: a request keeps naming the article it was about
 * even after that article is deleted, and the admin action on a vanished article
 * fails as a 404.
 */
export const takedownRequests = pgTable(
  'takedown_requests',
  {
    id: text().primaryKey(),
    requesterName: text().notNull(),
    requesterEmail: text().notNull(),
    articleUrl: text(),
    imageUrl: text(),
    claimType: text().$type<TakedownClaimType>().notNull(),
    explanation: text().notNull(),
    goodFaithAssertion: boolean().notNull(),
    status: text().$type<TakedownStatus>().notNull().default('pending'),
    articleId: text(),
    resolution: text(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    check('takedown_requests_id_format', sql`${t.id} ~ ${sql.raw(`'${RECORD_ID_SQL_PATTERN}'`)}`),
    check(
      'takedown_requests_claim_type_check',
      sql`${t.claimType} IN ${sqlInList(TakedownClaimTypeSchema.options)}`,
    ),
    check(
      'takedown_requests_status_check',
      sql`${t.status} IN ${sqlInList(TakedownStatusSchema.options)}`,
    ),
    // The only writer accepts `goodFaithAssertion: z.literal(true)`.
    check('takedown_requests_good_faith_check', sql`${t.goodFaithAssertion}`),
    // The review queue: by status, newest first.
    index('takedown_requests_status_created_at_idx').on(t.status, t.createdAt.desc()),
  ],
);

export type TakedownRequestRow = typeof takedownRequests.$inferSelect;
