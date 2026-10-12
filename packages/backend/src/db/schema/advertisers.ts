import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { RECORD_ID_SQL_PATTERN } from '../ids';

/**
 * Self-serve advertiser accounts, entirely separate from the CMS `users`: an
 * advertiser can book and pay for ads and nothing else. `id` is a 24-hex record id.
 */
export const advertisers = pgTable(
  'advertisers',
  {
    id: text().primaryKey(),
    /** Stored lowercase; the unique constraint makes a duplicate sign-up race-safe. */
    email: text().notNull(),
    /** bcrypt hash. Never serialized. */
    passwordHash: text().notNull(),
    companyName: text().notNull(),
    termsVersion: text().notNull(),
    termsAcceptedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    unique('advertisers_email_unique').on(t.email),
    check('advertisers_id_format', sql`${t.id} ~ ${sql.raw(`'${RECORD_ID_SQL_PATTERN}'`)}`),
    check('advertisers_email_lowercase', sql`${t.email} = lower(${t.email})`),
  ],
);

export type AdvertiserRow = typeof advertisers.$inferSelect;
