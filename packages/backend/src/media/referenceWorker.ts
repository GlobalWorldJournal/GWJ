import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/client';
import { mediaFileReferences } from '../db/schema/mediaFileReferences';
import type { MediaReferenceJobRow } from '../db/schema/mediaReferenceJobs';
import { errorFields, logger } from '../logger';
import type { MediaEntityType } from './entities';
import type { OxyFiles } from './oxyFiles';
import { filesOf } from './references';
import {
  claimReferenceJobs,
  failReferenceJob,
  finishReferenceJob,
  retryReferenceJob,
} from './referenceJobs';

/** How often each backend task looks for due reference jobs. */
export const REFERENCE_WORKER_INTERVAL_MS = 10_000;
const BATCH_SIZE = 20;
const LEASE_MS = 5 * 60_000;
/** Attempts before a job is given up on (the nightly reconciliation still repairs it). */
export const MAX_REFERENCE_ATTEMPTS = 10;
const BASE_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 6 * 60 * 60_000;

/** 1, 2, 4 … minutes after each failure, capped at six hours. */
export function referenceBackoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

export interface ReferenceSyncResult {
  added: number;
  removed: number;
  /** Files the entity shows that Oxy would not let GWJ reference (gone, or not GWJ's to use). */
  refused: number;
}

/**
 * Bring Oxy's references for one entity in line with what it shows now: add
 * the files it started using, remove the ones it stopped using (a dropped
 * image, a deleted article), and record what Oxy holds in
 * `media_file_references`. Removing a reference never deletes anything: a
 * GWJ file no record uses any more is collected by Oxy (ADR 0041 D5: trash
 * after 24 hours, purged 30 days later, restored by a new reference before).
 */
export async function syncEntityReferences(
  oxy: OxyFiles,
  entityType: MediaEntityType,
  entityId: string,
): Promise<ReferenceSyncResult> {
  const db = getDb();
  const current = new Set(await filesOf(oxy, entityType, entityId));
  const registeredRows = await db
    .select({ fileId: mediaFileReferences.fileId })
    .from(mediaFileReferences)
    .where(
      and(
        eq(mediaFileReferences.entityType, entityType),
        eq(mediaFileReferences.entityId, entityId),
      ),
    );
  const registered = new Set(registeredRows.map((row) => row.fileId));
  const toAdd = [...current].filter((fileId) => !registered.has(fileId));
  const toRemove = [...registered].filter((fileId) => !current.has(fileId));

  const added = await oxy.addReferences(toAdd.map((fileId) => ({ fileId, entityType, entityId })));
  const held = toAdd.filter((_, index) => added[index] === 'created' || added[index] === 'exists');
  const refused = toAdd.length - held.length;
  if (held.length > 0) {
    await db
      .insert(mediaFileReferences)
      .values(held.map((fileId) => ({ entityType, entityId, fileId })))
      .onConflictDoNothing();
  }
  if (refused > 0) {
    logger.warn('media references: Oxy refused some files this entity shows', {
      entityType,
      entityId,
      refused,
    });
  }

  await oxy.removeReferences(toRemove.map((fileId) => ({ fileId, entityType, entityId })));
  if (toRemove.length > 0) {
    await db
      .delete(mediaFileReferences)
      .where(
        and(
          eq(mediaFileReferences.entityType, entityType),
          eq(mediaFileReferences.entityId, entityId),
          inArray(mediaFileReferences.fileId, toRemove),
        ),
      );
  }
  return { added: held.length, removed: toRemove.length, refused };
}

async function runJob(oxy: OxyFiles, job: MediaReferenceJobRow, now: Date): Promise<void> {
  const meta = { jobId: job.id, entityType: job.entityType, entityId: job.entityId };
  try {
    const result = await syncEntityReferences(oxy, job.entityType, job.entityId);
    await finishReferenceJob(job);
    if (result.added + result.removed > 0)
      logger.info('media references synced', { ...meta, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (job.attempts >= MAX_REFERENCE_ATTEMPTS) {
      await failReferenceJob(job.id, message);
      logger.error('media reference job failed for good', {
        ...meta,
        attempts: job.attempts,
        ...errorFields(err),
      });
    } else {
      await retryReferenceJob(
        job.id,
        message,
        new Date(now.getTime() + referenceBackoffMs(job.attempts)),
      );
      logger.warn('media reference job failed; will retry', {
        ...meta,
        attempts: job.attempts,
        error: message,
      });
    }
  }
}

/** One pass: lease the due jobs and run each. Returns how many ran. */
export async function processReferenceJobs(oxy: OxyFiles, now: Date = new Date()): Promise<number> {
  const jobs = await claimReferenceJobs(now, BATCH_SIZE, LEASE_MS);
  for (const job of jobs) await runJob(oxy, job, now);
  return jobs.length;
}

/** Work the reference outbox every `intervalMs` (no overlapping passes). Returns a stop fn. */
export function startReferenceWorker(
  oxy: OxyFiles,
  intervalMs: number = REFERENCE_WORKER_INTERVAL_MS,
): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    processReferenceJobs(oxy)
      .catch((err: unknown) => logger.error('media reference pass failed', errorFields(err)))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  return () => clearInterval(timer);
}
