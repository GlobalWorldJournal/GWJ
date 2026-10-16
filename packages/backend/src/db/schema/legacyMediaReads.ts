import { bigint, date, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

/**
 * How many legacy-bucket URLs GWJ handed out, per UTC day and surface (`api` —
 * an article or ad served with a legacy URL in it; `portrait` — a writer
 * portrait not yet in Oxy; `redirect` — an old CDN URL resolved through
 * `/legacy-media/`). The bucket is retired only after a soak with zero `api`
 * and `portrait` reads (docs/OXY-FILES.md).
 */
export const legacyMediaReads = pgTable(
  'legacy_media_reads',
  {
    day: date({ mode: 'string' }).notNull(),
    surface: text().notNull(),
    count: bigint({ mode: 'number' }).notNull(),
  },
  (t) => [primaryKey({ name: 'legacy_media_reads_pkey', columns: [t.day, t.surface] })],
);
