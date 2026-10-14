import { sql } from 'drizzle-orm';
import { check, date, index, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { SUPPORTED_LANGUAGES } from '@gwj/shared-types';
import { RECORD_ID_SQL_PATTERN } from '../ids';
import { sqlInList } from '../sqlLiterals';

export const NEWSLETTER_STATUSES = ['pending', 'confirmed', 'unsubscribed'] as const;
export type NewsletterStatus = (typeof NEWSLETTER_STATUSES)[number];

/**
 * Readers subscribed to an edition's daily newsletter. Double opt-in: a row is
 * `pending` until the address is confirmed from the link mailed to it, and only
 * `confirmed` rows are sent issues. `id` is a 24-hex record id. `lastIssueOn` is
 * the edition-local date of the last issue claimed for the row, so an issue is
 * sent at most once per day however many tasks run the sender.
 */
export const newsletterSubscribers = pgTable(
  'newsletter_subscribers',
  {
    id: text().primaryKey(),
    /** Stored lowercase; the unique constraint makes a duplicate sign-up race-safe. */
    email: text().notNull(),
    language: text().notNull(),
    status: text().$type<NewsletterStatus>().notNull().default('pending'),
    /** When the reader last asked to subscribe (the consent we hold). */
    consentAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
    confirmationSentAt: timestamp({ withTimezone: true, mode: 'date' }),
    confirmedAt: timestamp({ withTimezone: true, mode: 'date' }),
    unsubscribedAt: timestamp({ withTimezone: true, mode: 'date' }),
    lastIssueOn: date({ mode: 'string' }),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    unique('newsletter_subscribers_email_unique').on(t.email),
    check(
      'newsletter_subscribers_id_format',
      sql`${t.id} ~ ${sql.raw(`'${RECORD_ID_SQL_PATTERN}'`)}`,
    ),
    check('newsletter_subscribers_email_lowercase', sql`${t.email} = lower(${t.email})`),
    check(
      'newsletter_subscribers_language_check',
      sql`${t.language} IN ${sqlInList(SUPPORTED_LANGUAGES)}`,
    ),
    check(
      'newsletter_subscribers_status_check',
      sql`${t.status} IN ${sqlInList(NEWSLETTER_STATUSES)}`,
    ),
    // The sender's scan: confirmed readers of one edition.
    index('newsletter_subscribers_send_idx')
      .on(t.language, t.lastIssueOn)
      .where(sql`${t.status} = 'confirmed'`),
  ],
);

export type NewsletterSubscriberRow = typeof newsletterSubscribers.$inferSelect;
