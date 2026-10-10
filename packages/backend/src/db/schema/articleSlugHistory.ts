import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { articles } from './articles'

/**
 * Slugs an article USED to have. When a slug changes, the old one is recorded
 * here so its URL keeps resolving (the public API answers it with a 301 to the
 * current slug). A slug in this table is reserved for its article: no other
 * article may claim it, or the redirect would be shadowed.
 */
export const articleSlugHistory = pgTable(
  'article_slug_history',
  {
    slug: text().primaryKey(),
    articleId: text()
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('article_slug_history_article_id_idx').on(t.articleId)],
)

export type ArticleSlugHistoryRow = typeof articleSlugHistory.$inferSelect
