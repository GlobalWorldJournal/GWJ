import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { getDb } from '../db/client';
import type { Executor } from '../db/repositories/articleRepository';
import { channelJobs, type ChannelJobAction, type ChannelJobRow } from '../db/schema/channelJobs';

export interface NewChannelJob {
  articleId: string;
  channel: string;
  action: ChannelJobAction;
}

/** Queue jobs — called inside the transaction of the article change they follow. */
export async function enqueueJobs(
  executor: Executor,
  jobs: readonly NewChannelJob[],
): Promise<void> {
  if (jobs.length === 0) return;
  await executor.insert(channelJobs).values([...jobs]);
}

/**
 * Lease up to `limit` due jobs for `leaseMs`. Safe across backend tasks: rows
 * another worker is claiming are skipped (FOR UPDATE SKIP LOCKED), and a job
 * whose lease expired (its worker died) becomes claimable again. A job waits
 * while an EARLIER job for the same article and channel is still pending, so a
 * retraction never overtakes the publish it undoes.
 */
export async function claimDueJobs(
  now: Date,
  limit: number,
  leaseMs: number,
): Promise<ChannelJobRow[]> {
  const db = getDb();
  const earlier = alias(channelJobs, 'earlier');
  const due = db
    .select({ id: channelJobs.id })
    .from(channelJobs)
    .where(
      and(
        eq(channelJobs.status, 'pending'),
        lte(channelJobs.nextAttemptAt, now),
        or(isNull(channelJobs.lockedUntil), lte(channelJobs.lockedUntil, now)),
        sql`not exists (${db
          .select({ one: sql`1` })
          .from(earlier)
          .where(
            and(
              eq(earlier.articleId, channelJobs.articleId),
              eq(earlier.channel, channelJobs.channel),
              lt(earlier.id, channelJobs.id),
              eq(earlier.status, 'pending'),
            ),
          )})`,
      ),
    )
    .orderBy(asc(channelJobs.id))
    .limit(limit)
    .for('update', { skipLocked: true });
  const claimed = await db
    .update(channelJobs)
    .set({
      lockedUntil: new Date(now.getTime() + leaseMs),
      attempts: sql`${channelJobs.attempts} + 1`,
      updatedAt: now,
    })
    .where(inArray(channelJobs.id, due))
    .returning();
  return claimed.sort((a, b) => a.id - b.id);
}

export async function completeJob(id: number): Promise<void> {
  await getDb()
    .update(channelJobs)
    .set({ status: 'done', lockedUntil: null, lastError: null, updatedAt: new Date() })
    .where(eq(channelJobs.id, id));
}

/** Release a failed attempt for another try at `nextAttemptAt`. */
export async function retryJob(id: number, error: string, nextAttemptAt: Date): Promise<void> {
  await getDb()
    .update(channelJobs)
    .set({ lockedUntil: null, lastError: error, nextAttemptAt, updatedAt: new Date() })
    .where(eq(channelJobs.id, id));
}

/** Give up on a job (out of attempts, or it can never succeed). */
export async function failJob(id: number, error: string): Promise<void> {
  await getDb()
    .update(channelJobs)
    .set({ status: 'failed', lockedUntil: null, lastError: error, updatedAt: new Date() })
    .where(eq(channelJobs.id, id));
}

/** Every job queued for an article, oldest first (tests and diagnostics). */
export async function jobsFor(articleId: string): Promise<ChannelJobRow[]> {
  return getDb()
    .select()
    .from(channelJobs)
    .where(eq(channelJobs.articleId, articleId))
    .orderBy(asc(channelJobs.id));
}
