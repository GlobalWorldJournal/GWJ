import { sql } from 'drizzle-orm';
import { bigint, check, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { sqlInList } from '../sqlLiterals';

/** What a distribution job does to an article's post on one channel. */
export const CHANNEL_JOB_ACTIONS = ['publish', 'update', 'retract'] as const;
export type ChannelJobAction = (typeof CHANNEL_JOB_ACTIONS)[number];

export const CHANNEL_JOB_STATUSES = ['pending', 'done', 'failed'] as const;
export type ChannelJobStatus = (typeof CHANNEL_JOB_STATUSES)[number];

/**
 * The distribution outbox: one row per (article, channel, action), written in
 * the SAME transaction as the article change that causes it — a committed
 * publish is always distributed, a rolled-back one never is. Every backend task
 * works the queue (channels/outbox.ts): a job is leased (`locked_until`) while
 * it runs, retried with backoff on failure, and given up on (`failed`) after a
 * bounded number of attempts. No foreign key to articles: a retraction must run
 * after the article row is gone.
 */
export const channelJobs = pgTable(
  'channel_jobs',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    articleId: text().notNull(),
    channel: text().notNull(),
    action: text().$type<ChannelJobAction>().notNull(),
    status: text().$type<ChannelJobStatus>().notNull().default('pending'),
    attempts: integer().notNull().default(0),
    nextAttemptAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    lockedUntil: timestamp({ withTimezone: true, mode: 'date' }),
    lastError: text(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    check('channel_jobs_action_check', sql`${t.action} IN ${sqlInList(CHANNEL_JOB_ACTIONS)}`),
    check('channel_jobs_status_check', sql`${t.status} IN ${sqlInList(CHANNEL_JOB_STATUSES)}`),
    // The worker's scan: pending jobs by due time.
    index('channel_jobs_pending_idx').on(t.nextAttemptAt).where(sql`${t.status} = 'pending'`),
    // Per (article, channel) ordering: a later job waits for an earlier pending one.
    index('channel_jobs_article_channel_idx').on(t.articleId, t.channel, t.id),
  ],
);

export type ChannelJobRow = typeof channelJobs.$inferSelect;
