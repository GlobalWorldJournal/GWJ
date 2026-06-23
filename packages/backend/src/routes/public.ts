import { Router, type Request, type Response } from 'express'
import {
  ArticleListQuerySchema,
  CATEGORIES,
  categorySlug,
  type ArticleListQuery,
} from '@gwj/shared-types'
import { articleService } from '../services/articleService'
import { validate } from '../middleware/validate'
import { requireParam } from '../middleware/params'
import { BadRequestError } from '../errors'

function readQuery(req: Request): ArticleListQuery {
  // `validate(..., 'query')` has already parsed and stashed the typed value.
  return req.validatedQuery as ArticleListQuery
}

export function createPublicRouter(): Router {
  const router = Router()

  router.get('/articles', validate(ArticleListQuerySchema, 'query'), async (req: Request, res: Response) => {
    const result = await articleService.list(readQuery(req))
    res.json(result)
  })

  router.get('/articles/:slug', async (req: Request, res: Response) => {
    const article = await articleService.getBySlug(requireParam(req, 'slug'))
    res.json(article)
  })

  router.get('/categories', (_req: Request, res: Response) => {
    const categories = CATEGORIES.map((name, index) => ({
      name,
      slug: categorySlug(name),
      order: index,
    }))
    res.json(categories)
  })

  router.get('/search', validate(ArticleListQuerySchema, 'query'), async (req: Request, res: Response) => {
    const query = readQuery(req)
    const q = query.q?.trim()
    if (!q) throw new BadRequestError('Query parameter "q" is required')
    const result = await articleService.search(q, query)
    res.json(result)
  })

  return router
}
