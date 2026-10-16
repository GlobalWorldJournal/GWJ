import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import type { Executor } from '../db/repositories/articleRepository';
import { mediaReferenceJobs, type MediaReferenceJobRow } from '../db/schema/mediaReferenceJobs';
import type { MediaEntityType } from './entities';

/**
 * Queue "sync this entity's references" — called INSIDE the transaction of the
 * change that may have altered what the entity shows, so a committed change is
 * always followed by its references and a rolled-back one never is. A job
 * already pending for the entity is not duplicated: its `generation` moves, so
 * a worker part-way through the older state runs it once more.
 */
export async function enqueueReferenceSync(
  executor: Executor,
  entityType: MediaEntityType,
  entityIds: readonly string[],
): Promise<void> {
  const unique = [...new Set(entityIds)];
  if (unique.length === 0) return;
  await executor
    .insert(mediaReferenceJobs)
    .values(unique.map((entityId) => ({ entityType, entityId })))
    .onConflictDoUpdate({
      target: [mediaReferenceJobs.entityType, mediaReferenceJobs.entityId],
      targetWhere: sql`${mediaReferenceJobs.status} = 'pending'`,
      set: {
        generation: sql`${mediaReferenceJobs.generation} + 1`,
        updatedAt: sql`now()`,
      },
    });
}

/**
 * Lease up to `limit` due jobs for `leaseMs`, safely across backend tasks
 * (rows another worker is claiming are skipped; an expired lease — a dead
 * worker — is claimable again).
 */
export async function claimReferenceJobs(
  now: Date,
  limit: number,
  leaseMs: number,
): Promise<MediaReferenceJobRow[]> {
  const db = getDb();
  const due = db
    .select({ id: mediaReferenceJobs.id })
    .from(mediaReferenceJobs)
    .where(
      and(
        eq(mediaReferenceJobs.status, 'pending'),
        lte(mediaReferenceJobs.nextAttemptAt, now),
        or(isNull(mediaReferenceJobs.lockedUntil), lte(mediaReferenceJobs.lockedUntil, now)),
      ),
    )
    .orderBy(asc(mediaReferenceJobs.nextAttemptAt), asc(mediaReferenceJobs.id))
    .limit(limit)
    .for('update', { skipLocked: true });
  const claimed = await db
    .update(mediaReferenceJobs)
    .set({
      lockedUntil: new Date(now.getTime() + leaseMs),
      attempts: sql`${mediaReferenceJobs.attempts} + 1`,
      updatedAt: now,
    })
    .where(inArray(mediaReferenceJobs.id, due))
    .returning();
  return claimed.sort((a, b) => a.id - b.id);
}

/**
 * Finish a job: deleted when nothing changed since it was claimed; otherwise
 * released (attempts reset) so the newer generation runs on the next pass.
 */
export async function finishReferenceJob(job: MediaReferenceJobRow): Promise<void> {
  const db = getDb();
  const deleted = await db
    .delete(mediaReferenceJobs)
    .where(
      and(eq(mediaReferenceJobs.id, job.id), eq(mediaReferenceJobs.generation, job.generation)),
    )
    .returning({ id: mediaReferenceJobs.id });
  if (deleted.length > 0) return;
  await db
    .update(mediaReferenceJobs)
    .set({ lockedUntil: null, attempts: 0, lastError: null, updatedAt: new Date() })
    .where(eq(mediaReferenceJobs.id, job.id));
}

export async function retryReferenceJob(
  id: number,
  error: string,
  nextAttemptAt: Date,
): Promise<void> {
  await getDb()
    .update(mediaReferenceJobs)
    .set({ lockedUntil: null, lastError: error, nextAttemptAt, updatedAt: new Date() })
    .where(eq(mediaReferenceJobs.id, id));
}

export async function failReferenceJob(id: number, error: string): Promise<void> {
  await getDb()
    .update(mediaReferenceJobs)
    .set({ status: 'failed', lockedUntil: null, lastError: error, updatedAt: new Date() })
    .where(eq(mediaReferenceJobs.id, id));
}
