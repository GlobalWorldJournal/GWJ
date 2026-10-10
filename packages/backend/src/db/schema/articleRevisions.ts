import { bigint, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { ArticleSnapshot } from '@gwj/shared-types';
import { articles } from './articles';

/**
 * An article's history: one row per change, holding the editable state BEFORE
 * that change and who made it. Written in the same transaction as the change
 * (articleService's `mutateArticle`), so history can never miss an edit.
 * Deleted with the article.
 */
export const articleRevisions = pgTable(
  'article_revisions',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    articleId: text()
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    snapshot: jsonb().$type<ArticleSnapshot>().notNull(),
    actor: text().notNull(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('article_revisions_article_created_idx').on(t.articleId, t.createdAt.desc())],
);

export type ArticleRevisionRow = typeof articleRevisions.$inferSelect;
