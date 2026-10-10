import { and, count, desc, eq, gt, ne, sql, type SQL } from 'drizzle-orm';
import type { Article, HeroImage, Seo, Source } from '@gwj/shared-types';
import { getDb, type Database } from '../client';
import { articles, type ArticleRow, type NewArticleRow } from '../schema/articles';
import { articleSlugHistory } from '../schema/articleSlugHistory';

/** A transaction handle or the pool — every function here accepts either. */
export type Executor = Pick<Database, 'select' | 'insert' | 'update' | 'delete'>;

/**
 * The text-search configuration QUERIES are parsed with: the Mongo text index's
 * `default_language`. (Each row's vector uses its own language; see the schema.)
 */
const QUERY_TS_CONFIG = sql.raw(`'english'::regconfig`);

/** Map a row to the public DTO. Absent optional values are OMITTED, as before. */
export function rowToArticle(row: ArticleRow): Article {
  const hero = row.heroImage;
  const heroImage: HeroImage | undefined = hero
    ? { url: hero.url, caption: hero.caption, credit: hero.credit, alt: hero.alt ?? '' }
    : undefined;
  const seo: Seo = {
    metaTitle: row.seo.metaTitle,
    metaDescription: row.seo.metaDescription,
    ogImage: row.seo.ogImage,
  };
  const source: Source | undefined = row.source
    ? { name: row.source.name, articleUrl: row.source.articleUrl, imageUrl: row.source.imageUrl }
    : undefined;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    deck: row.deck ?? undefined,
    kicker: row.kicker ?? undefined,
    category: row.category,
    language: row.language,
    author: row.author,
    body: row.body,
    heroImage,
    status: row.status,
    featured: row.featured,
    tags: row.tags,
    seo,
    source,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    firstPublishedAt: row.firstPublishedAt ? row.firstPublishedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * A parsed `$text`-style search string. The port keeps MongoDB's `$search`
 * semantics rather than Postgres' default AND:
 *
 * - bare terms are OR-ed (any term matches),
 * - a `"quoted phrase"` must match; with any phrase present, bare terms only
 *   affect ranking (Mongo: "only matches documents that include the phrase"),
 * - a `-term` excludes documents containing it,
 * - a search made only of exclusions (or of stop words) matches NOTHING.
 */
export interface ParsedSearch {
  terms: string[];
  phrases: string[];
  excluded: string[];
}

/** Split on anything that is not a letter or digit — Mongo's term delimiters. */
function words(text: string): string[] {
  return text.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 0);
}

export function parseSearch(q: string): ParsedSearch {
  const phrases: string[] = [];
  const rest = q.replace(/"([^"]*)"/g, (_match, phrase: string) => {
    if (words(phrase).length > 0) phrases.push(phrase);
    return ' ';
  });
  const terms: string[] = [];
  const excluded: string[] = [];
  for (const token of rest.split(/\s+/)) {
    if (token.startsWith('-')) excluded.push(...words(token.slice(1)));
    else terms.push(...words(token));
  }
  return { terms, phrases, excluded };
}

function combine(parts: SQL[], operator: '||' | '&&'): SQL | null {
  if (parts.length === 0) return null;
  return sql`(${sql.join(parts, sql.raw(` ${operator} `))})`;
}

/** The filter tsquery and the ranking tsquery for a search, or null when nothing can match. */
function searchQueries(q: string): { filter: SQL; rank: SQL } | null {
  const parsed = parseSearch(q);
  const termQueries = parsed.terms.map((t) => sql`plainto_tsquery(${QUERY_TS_CONFIG}, ${t})`);
  const phraseQueries = parsed.phrases.map((p) => sql`phraseto_tsquery(${QUERY_TS_CONFIG}, ${p})`);
  const positive =
    phraseQueries.length > 0 ? combine(phraseQueries, '&&') : combine(termQueries, '||');
  if (!positive) return null;
  const excluded = combine(
    parsed.excluded.map((t) => sql`!!plainto_tsquery(${QUERY_TS_CONFIG}, ${t})`),
    '&&',
  );
  const rank = combine([...termQueries, ...phraseQueries], '||') ?? positive;
  // `numnode(positive) > 0` keeps an all-stop-word positive side from collapsing
  // to "match everything not excluded" — `'' && !!'x'` is `!'x'` in Postgres.
  const filter = sql`(numnode(${positive}) > 0 and ${articles.searchVector} @@ (${
    excluded ? sql`${positive} && ${excluded}` : positive
  }))`;
  return { filter, rank };
}

export interface ArticleFilter {
  status?: Article['status'];
  category?: Article['category'];
  language?: Article['language'];
  featuredOnly?: boolean;
  author?: string;
  /** Free-text search over title + deck. */
  q?: string;
}

export interface ArticlePage {
  rows: ArticleRow[];
  total: number;
}

/**
 * One page of articles plus the total. With `q`, ordered by relevance then
 * newest; otherwise by featured weight, newest publication, newest creation.
 * `published_at` sorts NULLS LAST, where Mongo's descending sort put a null; an
 * `id` tie-break makes pagination deterministic.
 */
export async function listArticles(
  filter: ArticleFilter,
  page: number,
  limit: number,
): Promise<ArticlePage> {
  const db = getDb();
  const conditions: SQL[] = [];
  if (filter.status) conditions.push(eq(articles.status, filter.status));
  if (filter.category) conditions.push(eq(articles.category, filter.category));
  if (filter.language) conditions.push(eq(articles.language, filter.language));
  if (filter.featuredOnly) conditions.push(gt(articles.featured, 0));
  if (filter.author !== undefined) conditions.push(eq(articles.author, filter.author));

  const search = filter.q ? searchQueries(filter.q) : null;
  if (filter.q && !search) return { rows: [], total: 0 };
  if (search) conditions.push(search.filter);
  const where = and(...conditions);

  const order: SQL[] = search
    ? [
        sql`ts_rank(${articles.searchVector}, ${search.rank}) desc`,
        sql`${articles.publishedAt} desc nulls last`,
      ]
    : [
        desc(articles.featured),
        sql`${articles.publishedAt} desc nulls last`,
        desc(articles.createdAt),
      ];

  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(articles)
      .where(where)
      .orderBy(...order, desc(articles.id))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(articles).where(where),
  ]);
  return { rows, total: totals[0]?.total ?? 0 };
}

export async function countArticles(
  filter: Pick<ArticleFilter, 'status' | 'language' | 'author'>,
): Promise<number> {
  const conditions: SQL[] = [];
  if (filter.status) conditions.push(eq(articles.status, filter.status));
  if (filter.language) conditions.push(eq(articles.language, filter.language));
  if (filter.author !== undefined) conditions.push(eq(articles.author, filter.author));
  const [row] = await getDb()
    .select({ total: count() })
    .from(articles)
    .where(and(...conditions));
  return row?.total ?? 0;
}

export async function findArticleBySlug(
  slug: string,
  publishedOnly: boolean,
): Promise<ArticleRow | null> {
  const where = publishedOnly
    ? and(eq(articles.slug, slug), eq(articles.status, 'published'))
    : eq(articles.slug, slug);
  const [row] = await getDb().select().from(articles).where(where).limit(1);
  return row ?? null;
}

/** Load one article, row-locked when `tx` is a transaction (serializes concurrent edits). */
export async function findArticleByIdForUpdate(
  tx: Executor,
  id: string,
): Promise<ArticleRow | null> {
  const [row] = await tx.select().from(articles).where(eq(articles.id, id)).limit(1).for('update');
  return row ?? null;
}

export async function findArticleById(id: string): Promise<ArticleRow | null> {
  const [row] = await getDb().select().from(articles).where(eq(articles.id, id)).limit(1);
  return row ?? null;
}

/** Whether `slug` is held by any article other than `excludeId`. */
/**
 * Whether `slug` is unavailable to the article `excludeId` (or to a new one): held
 * by ANOTHER article's current slug, or reserved as another article's old slug —
 * claiming that would shadow its redirect. An article may reclaim its own old slug.
 */
export async function isSlugTaken(
  executor: Executor,
  slug: string,
  excludeId?: string,
): Promise<boolean> {
  const where = excludeId
    ? and(eq(articles.slug, slug), ne(articles.id, excludeId))
    : eq(articles.slug, slug);
  const [row] = await executor.select({ id: articles.id }).from(articles).where(where).limit(1);
  if (row) return true;
  const historyWhere = excludeId
    ? and(eq(articleSlugHistory.slug, slug), ne(articleSlugHistory.articleId, excludeId))
    : eq(articleSlugHistory.slug, slug);
  const [reserved] = await executor
    .select({ slug: articleSlugHistory.slug })
    .from(articleSlugHistory)
    .where(historyWhere)
    .limit(1);
  return reserved !== undefined;
}

/**
 * Record a slug change: the old slug now redirects to the article, and the new
 * slug leaves the history if the article is reclaiming one of its own old slugs.
 */
export async function recordSlugChange(
  executor: Executor,
  articleId: string,
  oldSlug: string,
  newSlug: string,
): Promise<void> {
  await executor
    .delete(articleSlugHistory)
    .where(and(eq(articleSlugHistory.slug, newSlug), eq(articleSlugHistory.articleId, articleId)));
  await executor
    .insert(articleSlugHistory)
    .values({ slug: oldSlug, articleId })
    .onConflictDoUpdate({
      target: articleSlugHistory.slug,
      set: { articleId, createdAt: new Date() },
    });
}

/** The CURRENT slug of the published article that once used `oldSlug`, if any. */
export async function findRedirectSlug(oldSlug: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ slug: articles.slug })
    .from(articleSlugHistory)
    .innerJoin(articles, eq(articles.id, articleSlugHistory.articleId))
    .where(and(eq(articleSlugHistory.slug, oldSlug), eq(articles.status, 'published')))
    .limit(1);
  return row?.slug ?? null;
}

export async function insertArticle(
  executor: Executor,
  values: NewArticleRow,
): Promise<ArticleRow> {
  const [row] = await executor.insert(articles).values(values).returning();
  if (!row) throw new Error('insert into articles returned no row');
  return row;
}

/** Apply a column patch. The caller passes ONLY changed columns (never an `undefined` value). */
export async function updateArticle(
  executor: Executor,
  id: string,
  changes: Partial<NewArticleRow>,
): Promise<ArticleRow> {
  const [row] = await executor.update(articles).set(changes).where(eq(articles.id, id)).returning();
  if (!row) throw new Error(`update of article ${id} matched no row`);
  return row;
}

export async function deleteArticle(id: string): Promise<boolean> {
  const rows = await getDb()
    .delete(articles)
    .where(eq(articles.id, id))
    .returning({ id: articles.id });
  return rows.length > 0;
}
