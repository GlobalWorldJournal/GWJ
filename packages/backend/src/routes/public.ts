import { Router, type Request, type Response } from 'express'
import {
  CATEGORIES,
  categorySlug,
  PublicArticleListQuerySchema,
  TakedownRequestInputSchema,
  type Article,
  type PaginatedArticles,
  type PaginatedPublicArticles,
  type PublicArticle,
  type PublicArticleListQuery,
  type TakedownRequestInput,
} from '@gwj/shared-types'
import { articleService } from '../services/articleService'
import { takedownService } from '../services/takedownService'
import { validate } from '../middleware/validate'
import { requireParam } from '../middleware/params'
import { BadRequestError } from '../errors'

function readQuery(req: Request): PublicArticleListQuery {
  // `validate(..., 'query')` has already parsed and stashed the typed value.
  return req.validatedQuery as PublicArticleListQuery
}

/** Drop the internal `source` provenance: it is for the newsroom, never readers. */
function toPublicArticle(article: Article): PublicArticle {
  const { source, ...publicFields } = article
  return publicFields
}

function toPublicPage(page: PaginatedArticles): PaginatedPublicArticles {
  return { data: page.data.map(toPublicArticle), pagination: page.pagination }
}

export function createPublicRouter(): Router {
  const router = Router()

  router.get('/articles', validate(PublicArticleListQuerySchema, 'query'), async (req: Request, res: Response) => {
    const result = await articleService.list(readQuery(req))
    res.json(toPublicPage(result))
  })

  router.get('/articles/:slug', async (req: Request, res: Response) => {
    const article = await articleService.getBySlug(requireParam(req, 'slug'))
    res.json(toPublicArticle(article))
  })

  router.get('/categories', (_req: Request, res: Response) => {
    const categories = CATEGORIES.map((name, index) => ({
      name,
      slug: categorySlug(name),
      order: index,
    }))
    res.json(categories)
  })

  router.get('/search', validate(PublicArticleListQuerySchema, 'query'), async (req: Request, res: Response) => {
    const query = readQuery(req)
    const q = query.q?.trim()
    if (!q) throw new BadRequestError('Query parameter "q" is required')
    const result = await articleService.search(q, query)
    res.json(toPublicPage(result))
  })

  router.post(
    '/takedown-requests',
    validate(TakedownRequestInputSchema),
    async (req: Request, res: Response) => {
      const record = await takedownService.create(req.body as TakedownRequestInput)
      // Never hand the requester our internal article match or anything beyond
      // confirmation — that resolution is for admin review, not a public response.
      res.status(201).json({ id: record.id, status: record.status })
    },
  )

  return router
}
