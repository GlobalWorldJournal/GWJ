import { date, index, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { articles } from './articles';

/**
 * Reader views per article per UTC day — the ranking behind "Most Popular".
 * Only a counter: no reader, address or cookie is stored (the privacy notice
 * promises cookieless reading). Deleted with the article.
 */
export const articleViewsDaily = pgTable(
  'article_views_daily',
  {
    articleId: text()
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    /** The UTC calendar day, `YYYY-MM-DD`. */
    day: date({ mode: 'string' }).notNull(),
    views: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.articleId, t.day] }),
    // The ranking scans a window of recent days.
    index('article_views_daily_day_idx').on(t.day),
  ],
);

export type ArticleViewsDailyRow = typeof articleViewsDaily.$inferSelect;
