import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Each roster writer's portrait, as a GWJ-owned Oxy file. Keyed by the writer's
 * fediverse username (`fediUsername`). A writer with no row is served from the
 * legacy bucket during the soak (and counted as a legacy read).
 */
export const writerPortraits = pgTable('writer_portraits', {
  username: text().primaryKey(),
  oxyFileId: text().notNull(),
  /** Who stored it (`user:<id>`, `migration`). */
  uploadedBy: text().notNull(),
  updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type WriterPortraitRow = typeof writerPortraits.$inferSelect;
