import { errorFields, logger } from '../logger';
import { articleService } from './articleService';

/** How often due drafts are looked for: a schedule fires within this delay. */
export const SCHEDULER_INTERVAL_MS = 30_000;

/**
 * Publish scheduled drafts as they come due, every `intervalMs`. Runs in every
 * backend task: `publishDue` is safe to run concurrently (row lock + publish
 * is idempotent), so no leader election is needed. A tick never overlaps the
 * previous one. Returns a stop function for graceful shutdown.
 */
export function startScheduler(intervalMs: number = SCHEDULER_INTERVAL_MS): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    articleService
      .publishDue()
      .then((published) => {
        if (published.length > 0) logger.info('scheduled articles published', { ids: published });
      })
      .catch((err: unknown) => logger.error('scheduler tick failed', errorFields(err)))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  return () => clearInterval(timer);
}
