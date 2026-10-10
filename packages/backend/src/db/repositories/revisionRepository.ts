import { and, desc, eq } from 'drizzle-orm';
import type { ArticleRevision, ArticleRevisionSummary, ArticleSnapshot } from '@gwj/shared-types';
import { getDb } from '../client';
import type { ArticleRow } from '../schema/articles';
import { articleRevisions } from '../schema/articleRevisions';
import type { Executor } from './articleRepository';

/** How many revisions a history listing returns (newest first). */
const REVISION_LIST_LIMIT = 100;

/** The editable state of an article row, as a revision stores it. */
export function snapshotOf(row: ArticleRow): ArticleSnapshot {
  return {
    slug: row.slug,
    title: row.title,
    deck: row.deck,
    kicker: row.kicker,
    category: row.category,
    language: row.language,
    author: row.author,
    body: row.body,
    heroImage: row.heroImage,
    status: row.status,
    featured: row.featured,
    tags: row.tags,
    seo: row.seo,
    source: row.source,
  };
}

export async function insertRevision(
  executor: Executor,
  articleId: string,
  snapshot: ArticleSnapshot,
  actor: string,
): Promise<void> {
  await executor.insert(articleRevisions).values({ articleId, snapshot, actor });
}

export async function listRevisions(articleId: string): Promise<ArticleRevisionSummary[]> {
  const rows = await getDb()
    .select()
    .from(articleRevisions)
    .where(eq(articleRevisions.articleId, articleId))
    .orderBy(desc(articleRevisions.createdAt), desc(articleRevisions.id))
    .limit(REVISION_LIST_LIMIT);
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    actor: row.actor,
    title: row.snapshot.title,
    status: row.snapshot.status,
  }));
}

export async function findRevision(
  articleId: string,
  revisionId: number,
): Promise<ArticleRevision | null> {
  const [row] = await getDb()
    .select()
    .from(articleRevisions)
    .where(and(eq(articleRevisions.articleId, articleId), eq(articleRevisions.id, revisionId)))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    articleId: row.articleId,
    createdAt: row.createdAt.toISOString(),
    actor: row.actor,
    title: row.snapshot.title,
    status: row.snapshot.status,
    snapshot: row.snapshot,
  };
}
