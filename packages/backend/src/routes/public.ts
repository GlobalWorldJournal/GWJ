import { Router, type NextFunction, type Request, type Response } from 'express';
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
} from '@gwj/shared-types';
import { articleService } from '../services/articleService';
import { takedownService } from '../services/takedownService';
import { validate } from '../middleware/validate';
import { requireParam } from '../middleware/params';
import { BadRequestError, NotFoundError } from '../errors';

function readQuery(req: Request): PublicArticleListQuery {
  // `validate(..., 'query')` has already parsed and stashed the typed value.
  return req.validatedQuery as PublicArticleListQuery;
}

/** Drop the internal `source` provenance: it is for the newsroom, never readers. */
function toPublicArticle(article: Article): PublicArticle {
  const { source, ...publicFields } = article;
  return publicFields;
}

function toPublicPage(page: PaginatedArticles): PaginatedPublicArticles {
  return { data: page.data.map(toPublicArticle), pagination: page.pagination };
}

/**
 * Public reads may be reused for a minute by browsers and shared caches (the
 * SEO worker's fetches through Cloudflare), and served stale while revalidating
 * for five more: a newly published story shows up within a minute.
 */
const PUBLIC_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';

export function createPublicRouter(): Router {
  const router = Router();

  router.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET') res.set('Cache-Control', PUBLIC_CACHE_CONTROL);
    next();
  });

  router.get(
    '/articles',
    validate(PublicArticleListQuerySchema, 'query'),
    async (req: Request, res: Response) => {
      const result = await articleService.list(readQuery(req));
      res.json(toPublicPage(result));
    },
  );

  router.get('/articles/:slug', async (req: Request, res: Response) => {
    const slug = requireParam(req, 'slug');
    try {
      res.json(toPublicArticle(await articleService.getBySlug(slug)));
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
      // A slug the article used to have: permanently redirect to its current one,
      // so old links (and the SEO worker, which follows it) land on the story.
      const current = await articleService.findRedirectSlug(slug);
      if (current === null) throw err;
      res.redirect(301, `${req.baseUrl}/articles/${encodeURIComponent(current)}`);
    }
  });

  router.get('/categories', (_req: Request, res: Response) => {
    const categories = CATEGORIES.map((name, index) => ({
      name,
      slug: categorySlug(name),
      order: index,
    }));
    res.json(categories);
  });

  router.get(
    '/search',
    validate(PublicArticleListQuerySchema, 'query'),
    async (req: Request, res: Response) => {
      const query = readQuery(req);
      const q = query.q?.trim();
      if (!q) throw new BadRequestError('Query parameter "q" is required');
      const result = await articleService.search(q, query);
      res.json(toPublicPage(result));
    },
  );

  router.post(
    '/takedown-requests',
    validate(TakedownRequestInputSchema),
    async (req: Request, res: Response) => {
      const record = await takedownService.create(req.body as TakedownRequestInput);
      // Never hand the requester our internal article match or anything beyond
      // confirmation — that resolution is for admin review, not a public response.
      res.status(201).json({ id: record.id, status: record.status });
    },
  );

  return router;
}
