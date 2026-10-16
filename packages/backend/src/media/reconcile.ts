/**
 * The nightly safety net (ADR 0041 D6): send Oxy GWJ's complete inventory of
 * file uses for each entity type, read from the content itself. Oxy adds the
 * references the reference worker missed (a crash between two writes), removes
 * the ones nothing uses any more, and reports both. Then the local mirror
 * (`media_file_references`) is rebuilt from the same inventory.
 *
 * This is also how existing content first enters Oxy's model: until GWJ's
 * first reconciliation, every GWJ file reads to Oxy as unused, and Oxy's
 * sweep (once switched to `enforce`) trashes an unused application file after
 * 24 hours. Run it (the migration does) before that switch.
 */
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { mediaFileReferences } from '../db/schema/mediaFileReferences';
import { mediaReconcileRuns, type MediaReconcileResult } from '../db/schema/mediaReconcileRuns';
import { errorFields, logger } from '../logger';
import { MEDIA_ENTITY_TYPES, type MediaEntityType } from './entities';
import type { OxyFiles } from './oxyFiles';
import { inventoryOf, type InventoryItem } from './references';

/** A reconciliation runs once a day per entity type. */
export const RECONCILE_EVERY_MS = 24 * 60 * 60_000;
/** How often each task checks whether one is due. */
export const RECONCILE_CHECK_INTERVAL_MS = 10 * 60_000;
/** The lease one task holds while reconciling (Oxy's own session expires after an hour idle). */
const RECONCILE_LEASE_MS = 60 * 60_000;
const MIRROR_BATCH = 500;

/** Take the reconciliation of `entityType` if it is due and nobody holds it. */
async function claim(entityType: MediaEntityType, now: Date, force: boolean): Promise<boolean> {
  const db = getDb();
  await db.insert(mediaReconcileRuns).values({ entityType }).onConflictDoNothing();
  const dueBefore = new Date(now.getTime() - RECONCILE_EVERY_MS);
  const claimed = await db
    .update(mediaReconcileRuns)
    .set({ lockedUntil: new Date(now.getTime() + RECONCILE_LEASE_MS), startedAt: now })
    .where(
      and(
        eq(mediaReconcileRuns.entityType, entityType),
        or(isNull(mediaReconcileRuns.lockedUntil), lt(mediaReconcileRuns.lockedUntil, now)),
        force
          ? sql`true`
          : or(isNull(mediaReconcileRuns.finishedAt), lt(mediaReconcileRuns.finishedAt, dueBefore)),
      ),
    )
    .returning({ entityType: mediaReconcileRuns.entityType });
  return claimed.length > 0;
}

/** Collects every pair sent so the mirror can be rebuilt from exactly the same inventory. */
async function* tee(
  source: AsyncIterable<InventoryItem>,
  seen: InventoryItem[],
): AsyncGenerator<InventoryItem> {
  for await (const item of source) {
    seen.push(item);
    yield item;
  }
}

async function rebuildMirror(entityType: MediaEntityType, items: InventoryItem[]): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.delete(mediaFileReferences).where(eq(mediaFileReferences.entityType, entityType));
    for (let start = 0; start < items.length; start += MIRROR_BATCH) {
      const batch = items.slice(start, start + MIRROR_BATCH);
      await tx
        .insert(mediaFileReferences)
        .values(batch.map((item) => ({ entityType, entityId: item.entityId, fileId: item.fileId })))
        .onConflictDoNothing();
    }
  });
}

/**
 * Reconcile one entity type now. With `dryRun`, Oxy only reports what it would
 * change and nothing local is touched.
 */
export async function reconcileEntityType(
  oxy: OxyFiles,
  entityType: MediaEntityType,
  options: { dryRun: boolean },
): Promise<MediaReconcileResult> {
  const sent: InventoryItem[] = [];
  const result = await oxy.reconcile(entityType, tee(inventoryOf(oxy, entityType), sent), options);
  if (!options.dryRun) await rebuildMirror(entityType, sent);
  return { ...result, inventory: sent.length };
}

/**
 * Run every due reconciliation this task can claim. `force` runs them even if
 * one finished less than a day ago (the migration's first run).
 */
export async function runDueReconciliations(
  oxy: OxyFiles,
  options: { now?: Date; force?: boolean } = {},
): Promise<Partial<Record<MediaEntityType, MediaReconcileResult>>> {
  const now = options.now ?? new Date();
  const results: Partial<Record<MediaEntityType, MediaReconcileResult>> = {};
  for (const entityType of MEDIA_ENTITY_TYPES) {
    if (!(await claim(entityType, now, options.force === true))) continue;
    try {
      const result = await reconcileEntityType(oxy, entityType, { dryRun: false });
      results[entityType] = result;
      await getDb()
        .update(mediaReconcileRuns)
        .set({ lockedUntil: null, finishedAt: new Date(), result, lastError: null })
        .where(eq(mediaReconcileRuns.entityType, entityType));
      const log = result.added + result.removed > 0 ? logger.warn : logger.info;
      log('media references reconciled', { entityType, ...result });
    } catch (err) {
      await getDb()
        .update(mediaReconcileRuns)
        .set({ lockedUntil: null, lastError: err instanceof Error ? err.message : String(err) })
        .where(eq(mediaReconcileRuns.entityType, entityType));
      logger.error('media reference reconciliation failed', { entityType, ...errorFields(err) });
    }
  }
  return results;
}

/** Check for a due reconciliation every `intervalMs`. Returns a stop fn. */
export function startReconciler(
  oxy: OxyFiles,
  intervalMs: number = RECONCILE_CHECK_INTERVAL_MS,
): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    runDueReconciliations(oxy)
      .catch((err: unknown) => logger.error('media reconciliation pass failed', errorFields(err)))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  return () => clearInterval(timer);
}
