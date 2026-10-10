import { errorFields, logger } from '../logger';
import { findArticleById, rowToArticle } from '../db/repositories/articleRepository';
import type { ChannelJobRow } from '../db/schema/channelJobs';
import { channelPostFor, recordChannelPost, removeChannelPost } from './channelPosts';
import { claimDueJobs, completeJob, failJob, retryJob } from './jobRepository';
import type { PublishChannel } from './types';

/** How often each backend task looks for due jobs. */
export const OUTBOX_INTERVAL_MS = 5_000;
/** Jobs leased per pass. */
const BATCH_SIZE = 10;
/** A job's lease: if its worker dies, another may take it after this long. */
const LEASE_MS = 5 * 60_000;
/** Attempts before a job is given up on (and logged as an error). */
export const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 6 * 60 * 60_000;

/** 1, 2, 4 … minutes after each failure, capped at six hours. */
export function backoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

/** Carry out one job against its channel. Throws on a failure worth retrying. */
async function runJob(job: ChannelJobRow, channel: PublishChannel): Promise<void> {
  if (job.action === 'retract') {
    const post = await channelPostFor(job.articleId, job.channel);
    if (post && channel.retract) await channel.retract(post.ref);
    await removeChannelPost(job.articleId, job.channel);
    return;
  }
  // publish/update act on the article as it is NOW: a story unpublished, deleted
  // (or moved to an edition this channel does not serve) since the job was
  // queued has nothing left to distribute here.
  const row = await findArticleById(job.articleId);
  if (!row || row.status !== 'published' || !channel.servesLanguage(row.language)) return;
  const article = rowToArticle(row);
  const post = await channelPostFor(job.articleId, job.channel);
  if (job.action === 'publish') {
    // Already posted (a retry after the post was recorded): nothing to redo.
    if (post) return;
    const ref = await channel.publish(article, { deliveryId: job.id });
    if (ref) await recordChannelPost(job.articleId, job.channel, ref);
    return;
  }
  if (!post || !channel.update) return;
  const replaced = await channel.update(article, post.ref);
  if (replaced) await recordChannelPost(job.articleId, job.channel, replaced);
}

/**
 * One pass over the outbox: lease the due jobs and run each, in order. Success
 * completes a job; a failure is retried with backoff, then given up on after
 * {@link MAX_ATTEMPTS} (an error log — which the alarm on error lines sees).
 * Returns how many jobs it ran.
 */
export async function processDueJobs(
  channels: readonly PublishChannel[],
  now: Date = new Date(),
): Promise<number> {
  const jobs = await claimDueJobs(now, BATCH_SIZE, LEASE_MS);
  for (const job of jobs) {
    const meta = {
      jobId: job.id,
      articleId: job.articleId,
      channel: job.channel,
      action: job.action,
    };
    const channel = channels.find((c) => c.name === job.channel);
    if (!channel) {
      await failJob(job.id, `no channel named ${job.channel} in this process`);
      logger.error('channel job failed: unknown channel', meta);
      continue;
    }
    try {
      await runJob(job, channel);
      await completeJob(job.id);
      logger.info('channel job done', { ...meta, attempts: job.attempts });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (job.attempts >= MAX_ATTEMPTS) {
        await failJob(job.id, message);
        logger.error('channel job failed for good', {
          ...meta,
          attempts: job.attempts,
          ...errorFields(err),
        });
      } else {
        await retryJob(job.id, message, new Date(now.getTime() + backoffMs(job.attempts)));
        logger.warn('channel job failed; will retry', {
          ...meta,
          attempts: job.attempts,
          error: message,
        });
      }
    }
  }
  return jobs.length;
}

/** Work the outbox every `intervalMs` (no overlapping passes). Returns a stop fn. */
export function startOutboxWorker(
  channels: readonly PublishChannel[],
  intervalMs: number = OUTBOX_INTERVAL_MS,
): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    processDueJobs(channels)
      .catch((err: unknown) => logger.error('outbox pass failed', errorFields(err)))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  return () => clearInterval(timer);
}
