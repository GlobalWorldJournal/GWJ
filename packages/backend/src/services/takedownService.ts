import { count, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm'
import {
  type PaginatedTakedownRequests,
  type TakedownAction,
  type TakedownListQuery,
  type TakedownRequestInput,
  type TakedownRequestRecord,
} from '@gwj/shared-types'
import { getDb } from '../db/client'
import { isRecordId, newRecordId } from '../db/ids'
import { articles } from '../db/schema/articles'
import { takedownRequests, type TakedownRequestRow } from '../db/schema/takedownRequests'
import { articleService } from './articleService'
import { NotFoundError } from '../errors'

/** Map a row to its public/admin DTO (absent optional values omitted, as before). */
export function takedownRequestToDTO(row: TakedownRequestRow): TakedownRequestRecord {
  return {
    id: row.id,
    requesterName: row.requesterName,
    requesterEmail: row.requesterEmail,
    articleUrl: row.articleUrl ?? undefined,
    imageUrl: row.imageUrl ?? undefined,
    claimType: row.claimType,
    explanation: row.explanation,
    goodFaithAssertion: true,
    status: row.status,
    articleId: row.articleId,
    resolution: row.resolution ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * Best-effort match of a submitted URL to one of our own articles: either it
 * names the story's own page (`/article/<slug>`), or it is the CDN/original
 * URL we recorded internally when the newsroom copied the image. Returns
 * null rather than guessing when nothing matches — a request with no
 * resolved article still gets reviewed, just without a one-click action.
 */
async function resolveArticleId(input: TakedownRequestInput): Promise<string | null> {
  const db = getDb()
  const slugMatch = input.articleUrl ? /\/article\/([^/?#]+)/.exec(input.articleUrl) : null
  const slug = slugMatch?.[1]
  if (slug) {
    const [bySlug] = await db.select({ id: articles.id }).from(articles).where(eq(articles.slug, slug)).limit(1)
    if (bySlug) return bySlug.id
  }
  const urls = [input.articleUrl, input.imageUrl].filter((u): u is string => !!u)
  if (urls.length === 0) return null
  const provenance: SQL[] = [
    inArray(sql`${articles.heroImage}->>'url'`, urls),
    inArray(sql`${articles.source}->>'articleUrl'`, urls),
    inArray(sql`${articles.source}->>'imageUrl'`, urls),
  ]
  // Oldest first: Mongo's un-sorted findOne returned the first in insertion order.
  const [byProvenance] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(or(...provenance))
    .orderBy(articles.createdAt, articles.id)
    .limit(1)
  return byProvenance?.id ?? null
}

async function findRowById(id: string): Promise<TakedownRequestRow> {
  const [row] = isRecordId(id)
    ? await getDb().select().from(takedownRequests).where(eq(takedownRequests.id, id)).limit(1)
    : []
  if (!row) throw new NotFoundError('Takedown request not found')
  return row
}

export interface TakedownService {
  create(input: TakedownRequestInput): Promise<TakedownRequestRecord>
  list(query: TakedownListQuery): Promise<PaginatedTakedownRequests>
  getById(id: string): Promise<TakedownRequestRecord>
  action(id: string, action: TakedownAction): Promise<TakedownRequestRecord>
}

export const takedownService: TakedownService = {
  async create(input) {
    const articleId = await resolveArticleId(input)
    const now = new Date()
    const [row] = await getDb()
      .insert(takedownRequests)
      .values({
        id: newRecordId(now),
        requesterName: input.requesterName,
        requesterEmail: input.requesterEmail,
        articleUrl: input.articleUrl,
        imageUrl: input.imageUrl,
        claimType: input.claimType,
        explanation: input.explanation,
        goodFaithAssertion: input.goodFaithAssertion,
        status: 'pending',
        articleId,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    if (!row) throw new Error('insert into takedown_requests returned no row')
    return takedownRequestToDTO(row)
  },

  async list(query) {
    const db = getDb()
    const where = query.status ? eq(takedownRequests.status, query.status) : undefined
    const [rows, totals] = await Promise.all([
      db
        .select()
        .from(takedownRequests)
        .where(where)
        .orderBy(desc(takedownRequests.createdAt), desc(takedownRequests.id))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit),
      db.select({ total: count() }).from(takedownRequests).where(where),
    ])
    const total = totals[0]?.total ?? 0
    return {
      data: rows.map(takedownRequestToDTO),
      pagination: { page: query.page, limit: query.limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / query.limit) },
    }
  },

  async getById(id) {
    return takedownRequestToDTO(await findRowById(id))
  },

  async action(id, action) {
    const current = await findRowById(id)
    if (action.status === 'actioned' && action.apply !== 'none' && current.articleId) {
      if (action.apply === 'unpublish') await articleService.unpublish(current.articleId)
      else if (action.apply === 'clear-hero-image') {
        // articleService.update()'s partial-patch semantics treat an absent field as
        // "leave it alone", so there is no way through it to unset one — this is the
        // one case that genuinely needs its own direct, minimal operation. (Mongo's
        // `$unset` via updateOne also stamped updatedAt through Mongoose timestamps.)
        await getDb()
          .update(articles)
          .set({ heroImage: null, updatedAt: new Date() })
          .where(eq(articles.id, current.articleId))
      }
    }
    const changes: Partial<Pick<TakedownRequestRow, 'status' | 'resolution'>> = {}
    if (action.status !== current.status) changes.status = action.status
    if (action.resolution !== undefined && action.resolution !== current.resolution) changes.resolution = action.resolution
    // No change, no write: a no-op save() did not move updatedAt under Mongoose.
    if (Object.keys(changes).length === 0) return takedownRequestToDTO(current)
    const [row] = await getDb()
      .update(takedownRequests)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(takedownRequests.id, id))
      .returning()
    if (!row) throw new NotFoundError('Takedown request not found')
    return takedownRequestToDTO(row)
  },
}
