import { sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { legacyMediaReads } from '../db/schema/legacyMediaReads';
import { utcDay } from '../db/repositories/viewRepository';
import { errorFields, logger } from '../logger';

/** Where a legacy-bucket URL was handed out (see `legacy_media_reads`). */
export type LegacyReadSurface = 'api' | 'portrait' | 'redirect';

/** How often the in-process counts are written. */
export const LEGACY_READ_FLUSH_MS = 60_000;

/** `<day>|<surface>` → reads not yet written. Counted in memory: a page view never writes. */
const pending = new Map<string, number>();

export function recordLegacyReads(
  surface: LegacyReadSurface,
  reads: number,
  at = new Date(),
): void {
  if (reads <= 0) return;
  const key = `${utcDay(at)}|${surface}`;
  pending.set(key, (pending.get(key) ?? 0) + reads);
}

/** Write the pending counts (added to what is stored). */
export async function flushLegacyReads(): Promise<void> {
  if (pending.size === 0) return;
  const rows = [...pending].map(([key, count]) => {
    const [day = '', surface = ''] = key.split('|');
    return { day, surface, count };
  });
  pending.clear();
  try {
    await getDb()
      .insert(legacyMediaReads)
      .values(rows)
      .onConflictDoUpdate({
        target: [legacyMediaReads.day, legacyMediaReads.surface],
        set: { count: sql`${legacyMediaReads.count} + excluded.count` },
      });
  } catch (err) {
    // Not lost: put back for the next flush.
    for (const row of rows) {
      const key = `${row.day}|${row.surface}`;
      pending.set(key, (pending.get(key) ?? 0) + row.count);
    }
    throw err;
  }
}

/** Flush every `intervalMs`; the returned stop fn flushes once more. */
export function startLegacyReadFlusher(
  intervalMs: number = LEGACY_READ_FLUSH_MS,
): () => Promise<void> {
  const timer = setInterval(() => {
    flushLegacyReads().catch((err: unknown) =>
      logger.error('legacy media read flush failed', errorFields(err)),
    );
  }, intervalMs);
  return async () => {
    clearInterval(timer);
    await flushLegacyReads().catch((err: unknown) =>
      logger.error('legacy media read flush failed', errorFields(err)),
    );
  };
}
