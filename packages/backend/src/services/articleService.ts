import { isDeepStrictEqual } from 'node:util'
import {
  type Article,
  type ArticleInput,
  type ArticleListQuery,
  type ArticleUpdate,
  type PaginatedArticles,
  slugify,
} from '@gwj/shared-types'
import { getDb } from '../db/client'
import { isRecordId, newRecordId } from '../db/ids'
import {
  deleteArticle,
  findArticleById,
  findArticleByIdForUpdate,
  findArticleBySlug,
  insertArticle,
  isSlugTaken,
  listArticles,
  rowToArticle,
  updateArticle,
  type ArticleFilter,
  type Executor,
} from '../db/repositories/articleRepository'
import type { ArticleRow, NewArticleRow } from '../db/schema/articles'
import { NotFoundError } from '../errors'

/** Fallback slug stem when a title slugifies to an empty string (e.g. all symbols). */
const FALLBACK_SLUG = 'article'

/**
 * A listener notified when an article transitions INTO the published state — i.e.
 * a fresh publish, not a re-save of an already-published article. ActivityPub
 * delivery subscribes to this so federation stays decoupled: the dependency points
 * AP → articleService, never the reverse. Listeners must not throw; they own their
 * own error handling and must never block or fail the publish response.
 */
export type ArticlePublishedListener = (article: Article) => void

const publishedListeners: ArticlePublishedListener[] = []

/** Register a listener for article-published transitions. Returns an unsubscribe fn. */
export function onArticlePublished(listener: ArticlePublishedListener): () => void {
  publishedListeners.push(listener)
  return () => {
    const index = publishedListeners.indexOf(listener)
    if (index >= 0) publishedListeners.splice(index, 1)
  }
}

/** Notify all registered listeners that an article just became published. */
function emitArticlePublished(article: Article): void {
  for (const listener of publishedListeners) {
    listener(article)
  }
}

/**
 * Generate a slug unique across the table. Starts from the title's slug and
 * appends `-2`, `-3`, … until no OTHER article claims it. The `articles_slug_unique`
 * constraint remains the authority: a concurrent writer that wins the race makes
 * this insert fail with 23505, which the error handler answers as 409.
 */
async function generateUniqueSlug(executor: Executor, title: string, excludeId?: string): Promise<string> {
  const base = slugify(title) || FALLBACK_SLUG
  let candidate = base
  let suffix = 2
  while (await isSlugTaken(executor, candidate, excludeId)) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }
  return candidate
}

function buildPaginated(rows: ArticleRow[], total: number, page: number, limit: number): PaginatedArticles {
  return {
    data: rows.map(rowToArticle),
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  }
}

/**
 * Compare the way Mongoose decided a path was modified: by value. A JSON round
 * trip drops `undefined` keys first, so `{ url, caption: undefined }` from a patch
 * equals the stored `{ url }`.
 */
function sameValue(a: unknown, b: unknown): boolean {
  const normalize = (v: unknown): unknown => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
  }
  return isDeepStrictEqual(normalize(a), normalize(b))
}

/**
 * Run a read-modify-write on one article inside a transaction with the row locked
 * (`SELECT … FOR UPDATE`), so two concurrent publishes cannot both observe "draft"
 * and both fan out. Only columns whose value actually changes are written, and
 * `updated_at` moves only when something did — a re-save of identical values was
 * a no-op `save()` under Mongoose and stays one here.
 */
async function mutateArticle(
  id: string,
  apply: (current: ArticleRow, tx: Executor) => Promise<Partial<NewArticleRow>>,
): Promise<{ before: ArticleRow; after: ArticleRow }> {
  if (!isRecordId(id)) throw new NotFoundError('Article not found')
  return getDb().transaction(async (tx) => {
    const current = await findArticleByIdForUpdate(tx, id)
    if (!current) throw new NotFoundError('Article not found')
    const proposed = await apply(current, tx)
    const changes: Partial<NewArticleRow> = {}
    for (const [key, value] of Object.entries(proposed) as [keyof NewArticleRow, unknown][]) {
      if (value === undefined) continue
      if (!sameValue(value, current[key as keyof ArticleRow])) {
        Object.assign(changes, { [key]: value })
      }
    }
    if (Object.keys(changes).length === 0) return { before: current, after: current }
    const after = await updateArticle(tx, id, { ...changes, updatedAt: new Date() })
    return { before: current, after }
  })
}

/** Options controlling whether a listing is restricted to published articles. */
export interface ListOptions {
  /** When true, no implicit `status: 'published'` filter is applied (admin path). */
  includeAll?: boolean
  /** Restrict to a single exact author (the ActivityPub writer-outbox path). */
  author?: string
}

/** Options controlling whether a single fetch may return a draft. */
export interface GetOptions {
  /** When true, drafts are returned too (admin path); default is published-only. */
  includeDrafts?: boolean
}

export interface ArticleService {
  list(query: ArticleListQuery, options?: ListOptions): Promise<PaginatedArticles>
  getBySlug(slug: string, options?: GetOptions): Promise<Article>
  getById(id: string): Promise<Article>
  create(input: ArticleInput): Promise<Article>
  update(id: string, patch: ArticleUpdate): Promise<Article>
  publish(id: string): Promise<Article>
  unpublish(id: string): Promise<Article>
  remove(id: string): Promise<void>
  search(q: string, query: ArticleListQuery): Promise<PaginatedArticles>
}

export const articleService: ArticleService = {
  async list(query, options) {
    const filter: ArticleFilter = {}
    if (query.status) {
      filter.status = query.status
    } else if (!options?.includeAll) {
      // A public listing with no explicit status must only ever surface published work.
      filter.status = 'published'
    }
    if (query.category) filter.category = query.category
    if (query.language) filter.language = query.language
    if (query.featured) filter.featuredOnly = true
    if (options?.author !== undefined) filter.author = options.author

    // Free-text search (title/deck). Lets the admin/MCP check for an EXISTING
    // similar story before writing a new one — incl. drafts on the admin path —
    // so the newsroom does not publish duplicates.
    const q = query.q?.trim()
    if (q) filter.q = q

    const { rows, total } = await listArticles(filter, query.page, query.limit)
    return buildPaginated(rows, total, query.page, query.limit)
  },

  async getBySlug(slug, options) {
    const row = await findArticleBySlug(slug, !options?.includeDrafts)
    if (!row) throw new NotFoundError('Article not found')
    return rowToArticle(row)
  },

  async getById(id) {
    // A malformed id is a resource that does not exist (404), not a server error.
    const row = isRecordId(id) ? await findArticleById(id) : null
    if (!row) throw new NotFoundError('Article not found')
    return rowToArticle(row)
  },

  async create(input) {
    const db = getDb()
    const now = new Date()
    const row = await insertArticle(db, {
      id: newRecordId(now),
      slug: await generateUniqueSlug(db, input.title),
      title: input.title,
      deck: input.deck,
      kicker: input.kicker,
      category: input.category,
      language: input.language,
      author: input.author,
      body: input.body,
      heroImage: input.heroImage,
      status: input.status,
      featured: input.featured,
      tags: input.tags,
      seo: input.seo,
      source: input.source,
      publishedAt: input.status === 'published' ? now : null,
      createdAt: now,
      updatedAt: now,
    })
    const article = rowToArticle(row)
    // A story created directly in the published state federates immediately.
    if (article.status === 'published') emitArticlePublished(article)
    return article
  },

  async update(id, patch) {
    const { before, after } = await mutateArticle(id, async (current, tx) => {
      const changes: Partial<NewArticleRow> = {
        title: patch.title,
        deck: patch.deck,
        kicker: patch.kicker,
        category: patch.category,
        language: patch.language,
        author: patch.author,
        body: patch.body,
        heroImage: patch.heroImage,
        featured: patch.featured,
        tags: patch.tags,
        seo: patch.seo,
        source: patch.source,
      }
      if (patch.title !== undefined && patch.title !== current.title) {
        changes.slug = await generateUniqueSlug(tx, patch.title, id)
      }
      if (patch.status !== undefined) {
        changes.status = patch.status
        if (patch.status === 'published' && !current.publishedAt) changes.publishedAt = new Date()
        if (patch.status === 'draft') changes.publishedAt = null
      }
      return changes
    })
    const article = rowToArticle(after)
    // Fan out only on the draft→published transition, not on edits to an already
    // published story, so followers aren't re-notified for every correction.
    if (before.status !== 'published' && article.status === 'published') emitArticlePublished(article)
    return article
  },

  async publish(id) {
    const { before, after } = await mutateArticle(id, async (current) => ({
      status: 'published',
      // Preserve the original publish time on re-publish; only stamp it the first time.
      publishedAt: current.publishedAt ?? new Date(),
    }))
    const article = rowToArticle(after)
    if (before.status !== 'published') emitArticlePublished(article)
    return article
  },

  async unpublish(id) {
    const { after } = await mutateArticle(id, async () => ({ status: 'draft', publishedAt: null }))
    return rowToArticle(after)
  },

  async remove(id) {
    if (!isRecordId(id) || !(await deleteArticle(id))) throw new NotFoundError('Article not found')
  },

  async search(q, query) {
    const filter: ArticleFilter = { status: query.status ?? 'published', q }
    if (query.category) filter.category = query.category
    if (query.language) filter.language = query.language
    const { rows, total } = await listArticles(filter, query.page, query.limit)
    return buildPaginated(rows, total, query.page, query.limit)
  },
}
