import { isValidObjectId } from 'mongoose'
import {
  type Article,
  type ArticleInput,
  type ArticleListQuery,
  type ArticleUpdate,
  type PaginatedArticles,
  slugify,
} from '@gwj/shared-types'
import { ArticleModel, articleToDTO, type ArticleDoc } from '../models/Article'
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
 * Generate a slug unique across the collection. Starts from the title's slug and
 * appends `-2`, `-3`, … until no existing document claims it. An optional
 * `excludeId` lets updates keep checking against everyone *but themselves*.
 */
async function generateUniqueSlug(title: string, excludeId?: string): Promise<string> {
  const base = slugify(title) || FALLBACK_SLUG
  let candidate = base
  let suffix = 2
  for (;;) {
    const existing = await ArticleModel.findOne({ slug: candidate }).select('_id').lean()
    if (!existing || (excludeId && existing._id.toString() === excludeId)) return candidate
    candidate = `${base}-${suffix}`
    suffix += 1
  }
}

async function findDocById(id: string): Promise<ArticleDoc> {
  // A malformed id is a resource that does not exist (404), not a server error.
  if (!isValidObjectId(id)) throw new NotFoundError('Article not found')
  const doc = await ArticleModel.findById(id)
  if (!doc) throw new NotFoundError('Article not found')
  return doc
}

function buildPaginated(docs: ArticleDoc[], total: number, page: number, limit: number): PaginatedArticles {
  return {
    data: docs.map((d) => articleToDTO(d)),
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  }
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
    const filter: Record<string, unknown> = {}
    if (query.status) {
      filter.status = query.status
    } else if (!options?.includeAll) {
      // A public listing with no explicit status must only ever surface published work.
      filter.status = 'published'
    }
    if (query.category) filter.category = query.category
    if (query.language) filter.language = query.language
    if (query.featured) filter.featured = { $gt: 0 }
    if (options?.author) filter.author = options.author

    const total = await ArticleModel.countDocuments(filter)
    const docs = await ArticleModel.find(filter)
      .sort({ featured: -1, publishedAt: -1, createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
    return buildPaginated(docs, total, query.page, query.limit)
  },

  async getBySlug(slug, options) {
    const filter = options?.includeDrafts ? { slug } : { slug, status: 'published' }
    const doc = await ArticleModel.findOne(filter)
    if (!doc) throw new NotFoundError('Article not found')
    return articleToDTO(doc)
  },

  async getById(id) {
    const doc = await findDocById(id)
    return articleToDTO(doc)
  },

  async create(input) {
    const slug = await generateUniqueSlug(input.title)
    const publishedAt = input.status === 'published' ? new Date() : null
    const doc = await ArticleModel.create({ ...input, slug, publishedAt })
    const article = articleToDTO(doc)
    // A story created directly in the published state federates immediately.
    if (article.status === 'published') emitArticlePublished(article)
    return article
  },

  async update(id, patch) {
    const doc = await findDocById(id)
    const wasPublished = doc.status === 'published'
    if (patch.title !== undefined && patch.title !== doc.title) {
      doc.slug = await generateUniqueSlug(patch.title, id)
    }
    // Assign only the fields present in the partial patch.
    if (patch.title !== undefined) doc.title = patch.title
    if (patch.deck !== undefined) doc.deck = patch.deck
    if (patch.kicker !== undefined) doc.kicker = patch.kicker
    if (patch.category !== undefined) doc.category = patch.category
    if (patch.language !== undefined) doc.language = patch.language
    if (patch.author !== undefined) doc.author = patch.author
    if (patch.body !== undefined) doc.body = patch.body
    if (patch.heroImage !== undefined) doc.heroImage = patch.heroImage
    if (patch.featured !== undefined) doc.featured = patch.featured
    if (patch.tags !== undefined) doc.tags = patch.tags
    if (patch.seo !== undefined) doc.seo = patch.seo
    if (patch.source !== undefined) doc.source = patch.source
    if (patch.status !== undefined) {
      doc.status = patch.status
      if (patch.status === 'published' && !doc.publishedAt) doc.publishedAt = new Date()
      if (patch.status === 'draft') doc.publishedAt = null
    }
    await doc.save()
    const article = articleToDTO(doc)
    // Fan out only on the draft→published transition, not on edits to an already
    // published story, so followers aren't re-notified for every correction.
    if (!wasPublished && article.status === 'published') emitArticlePublished(article)
    return article
  },

  async publish(id) {
    const doc = await findDocById(id)
    const wasPublished = doc.status === 'published'
    doc.status = 'published'
    // Preserve the original publish time on re-publish; only stamp it the first time.
    if (!doc.publishedAt) doc.publishedAt = new Date()
    await doc.save()
    const article = articleToDTO(doc)
    if (!wasPublished) emitArticlePublished(article)
    return article
  },

  async unpublish(id) {
    const doc = await findDocById(id)
    doc.status = 'draft'
    doc.publishedAt = null
    await doc.save()
    return articleToDTO(doc)
  },

  async remove(id) {
    if (!isValidObjectId(id)) throw new NotFoundError('Article not found')
    const result = await ArticleModel.findByIdAndDelete(id)
    if (!result) throw new NotFoundError('Article not found')
  },

  async search(q, query) {
    const filter: Record<string, unknown> = {
      status: query.status ?? 'published',
      $text: { $search: q },
    }
    if (query.category) filter.category = query.category
    if (query.language) filter.language = query.language

    const total = await ArticleModel.countDocuments(filter)
    const docs = await ArticleModel.find(filter)
      .sort({ score: { $meta: 'textScore' }, publishedAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
    return buildPaginated(docs, total, query.page, query.limit)
  },
}
