import { and, desc, eq, gte, sql, sum } from 'drizzle-orm';
import type { Language } from '@gwj/shared-types';
import { getDb } from '../client';
import { articles, type ArticleRow } from '../schema/articles';
import { articleViewsDaily } from '../schema/articleViews';

/** A UTC calendar day as Postgres `date` text: `YYYY-MM-DD`. */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * Count one view of a published article on `day`. A draft, or an id that names
 * no article, counts nothing. Returns whether the view was counted.
 */
export async function recordView(articleId: string, day: string): Promise<boolean> {
  const db = getDb();
  const counted = await db
    .insert(articleViewsDaily)
    .select(
      db
        .select({
          articleId: articles.id,
          day: sql<string>`${day}::date`.as('day'),
          views: sql<number>`1`.as('views'),
        })
        .from(articles)
        .where(and(eq(articles.id, articleId), eq(articles.status, 'published'))),
    )
    .onConflictDoUpdate({
      target: [articleViewsDaily.articleId, articleViewsDaily.day],
      set: { views: sql`${articleViewsDaily.views} + 1` },
    })
    .returning({ articleId: articleViewsDaily.articleId });
  return counted.length > 0;
}

/**
 * The most viewed published articles of one edition since `sinceDay`
 * (inclusive), most viewed first; ties go to the newer story.
 */
export async function findMostViewed(
  language: Language,
  sinceDay: string,
  limit: number,
): Promise<ArticleRow[]> {
  const db = getDb();
  const totals = db
    .select({
      articleId: articleViewsDaily.articleId,
      views: sum(articleViewsDaily.views).as('views'),
    })
    .from(articleViewsDaily)
    .where(gte(articleViewsDaily.day, sinceDay))
    .groupBy(articleViewsDaily.articleId)
    .as('totals');
  const rows = await db
    .select({ article: articles })
    .from(articles)
    .innerJoin(totals, eq(totals.articleId, articles.id))
    .where(and(eq(articles.status, 'published'), eq(articles.language, language)))
    .orderBy(desc(totals.views), desc(articles.publishedAt))
    .limit(limit);
  return rows.map((row) => row.article);
}
