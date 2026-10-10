import { isValidObjectId } from 'mongoose'
import {
  type PaginatedTakedownRequests,
  type TakedownAction,
  type TakedownListQuery,
  type TakedownRequestInput,
  type TakedownRequestRecord,
} from '@gwj/shared-types'
import { ArticleModel } from '../models/Article'
import { TakedownRequestModel, takedownRequestToDTO, type TakedownRequestDoc } from '../models/TakedownRequest'
import { articleService } from './articleService'
import { NotFoundError } from '../errors'

/**
 * Best-effort match of a submitted URL to one of our own articles: either it
 * names the story's own page (`/article/<slug>`), or it is the CDN/original
 * URL we recorded internally when the newsroom copied the image. Returns
 * null rather than guessing when nothing matches — a request with no
 * resolved article still gets reviewed, just without a one-click action.
 */
async function resolveArticleId(input: TakedownRequestInput): Promise<string | null> {
  const slugMatch = input.articleUrl ? /\/article\/([^/?#]+)/.exec(input.articleUrl) : null
  if (slugMatch) {
    const bySlug = await ArticleModel.findOne({ slug: slugMatch[1] }).select('_id').lean()
    if (bySlug) return bySlug._id.toString()
  }
  const urls = [input.articleUrl, input.imageUrl].filter((u): u is string => !!u)
  if (urls.length === 0) return null
  const byProvenance = await ArticleModel.findOne({
    $or: [
      { 'heroImage.url': { $in: urls } },
      { 'source.articleUrl': { $in: urls } },
      { 'source.imageUrl': { $in: urls } },
    ],
  })
    .select('_id')
    .lean()
  return byProvenance ? byProvenance._id.toString() : null
}

function buildPaginated(
  docs: TakedownRequestDoc[],
  total: number,
  page: number,
  limit: number,
): PaginatedTakedownRequests {
  return {
    data: docs.map((d) => takedownRequestToDTO(d)),
    pagination: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) },
  }
}

async function findDocById(id: string): Promise<TakedownRequestDoc> {
  if (!isValidObjectId(id)) throw new NotFoundError('Takedown request not found')
  const doc = await TakedownRequestModel.findById(id)
  if (!doc) throw new NotFoundError('Takedown request not found')
  return doc
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
    const doc = await TakedownRequestModel.create({ ...input, status: 'pending', articleId })
    return takedownRequestToDTO(doc)
  },

  async list(query) {
    const filter: Record<string, unknown> = {}
    if (query.status) filter.status = query.status
    const total = await TakedownRequestModel.countDocuments(filter)
    const docs = await TakedownRequestModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
    return buildPaginated(docs, total, query.page, query.limit)
  },

  async getById(id) {
    const doc = await findDocById(id)
    return takedownRequestToDTO(doc)
  },

  async action(id, action) {
    const doc = await findDocById(id)
    if (action.status === 'actioned' && action.apply !== 'none' && doc.articleId) {
      if (action.apply === 'unpublish') await articleService.unpublish(doc.articleId.toString())
      else if (action.apply === 'clear-hero-image') {
        // articleService.update()'s partial-patch semantics treat an absent field as
        // "leave it alone", so there is no way through it to unset one — this is the
        // one case that genuinely needs its own direct, minimal operation.
        await ArticleModel.updateOne({ _id: doc.articleId }, { $unset: { heroImage: 1 } })
      }
    }
    doc.status = action.status
    if (action.resolution !== undefined) doc.resolution = action.resolution
    await doc.save()
    return takedownRequestToDTO(doc)
  },
}
