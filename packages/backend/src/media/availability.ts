import { or, ne, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { oxyFileStates } from '../db/schema/oxyFileStates';

/**
 * The Oxy files GWJ must not show: those Oxy reported taken down (`blocked`),
 * in trash, deleted, or made private (ADR 0041 D9). Rare, so the whole set is
 * held in memory and re-read at most every {@link HIDDEN_FILES_TTL_MS} (another
 * task's event reaches this one within that), and at once after this task
 * receives an event.
 */
export const HIDDEN_FILES_TTL_MS = 30_000;

let cached: { at: number; files: ReadonlySet<string> } | null = null;

export async function hiddenFiles(now = Date.now()): Promise<ReadonlySet<string>> {
  if (cached && now - cached.at < HIDDEN_FILES_TTL_MS) return cached.files;
  const rows = await getDb()
    .select({ fileId: oxyFileStates.fileId })
    .from(oxyFileStates)
    .where(or(ne(oxyFileStates.status, 'active'), eq(oxyFileStates.visibility, 'private')));
  cached = { at: now, files: new Set(rows.map((row) => row.fileId)) };
  return cached.files;
}

/** Forget the cached set (after an event changed it). */
export function invalidateHiddenFiles(): void {
  cached = null;
}
