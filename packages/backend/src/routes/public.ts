import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  ActiveAdQuerySchema,
  CATEGORIES,
  categorySlug,
  PopularArticlesQuerySchema,
  PublicArticleListQuerySchema,
  TakedownRequestInputSchema,
  type ActiveAdQuery,
  type ActiveAdResponse,
  type Article,
  type PaginatedArticles,
  type PaginatedPublicArticles,
  type PopularArticles,
  type PopularArticlesQuery,
  type PublicArticle,
  type PublicArticleListQuery,
  type TakedownRequestInput,
} from '@gwj/shared-types';
import { adCampaignService } from '../services/adCampaignService';
import { articleService } from '../services/articleService';
import { takedownService } from '../services/takedownService';
import type { MediaPresenter } from '../media/presentation';
import { validate } from '../middleware/validate';
import { requireParam } from '../middleware/params';
import { BadRequestError, NotFoundError } from '../errors';

function readQuery(req: Request): PublicArticleListQuery {
  // `validate(..., 'query')` has already parsed and stashed the typed value.
  return req.validatedQuery as PublicArticleListQuery;
}

/**
 * Drop the internal `source` provenance (for the newsroom, never readers), and
 * show the images as readers may see them (`media/presentation.ts`).
 */
function publicView(presenter: MediaPresenter) {
  const articles = (list: Article[]): Promise<PublicArticle[]> =>
    presenter.articles(list.map(({ source, ...publicFields }) => publicFields));
  return {
    articles,
    article: async (article: Article): Promise<PublicArticle> => {
      const [shown] = await articles([article]);
      if (!shown) throw new Error('presenting one article returned none');
      return shown;
    },
    page: async (page: PaginatedArticles): Promise<PaginatedPublicArticles> => ({
      data: await articles(page.data),
      pagination: page.pagination,
    }),
  };
}

/**
 * Public reads may be reused for a minute by browsers and shared caches (the
 * SEO worker's fetches through Cloudflare), and served stale while revalidating
 * for five more: a newly published story shows up within a minute.
 */
const PUBLIC_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';

/**
 * The slot answer is cached for a minute but never served stale: a paused or
 * ended campaign leaves the page within a minute, not six.
 */
const AD_CACHE_CONTROL = 'public, max-age=60';

/** Views one client may report per window — a reader's session, not a script's loop. */
const VIEW_WINDOW_MS = 15 * 60 * 1000;
const VIEW_MAX = 60;

export function createPublicRouter(presenter: MediaPresenter): Router {
  const router = Router();
  const view = publicView(presenter);

  router.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET') res.set('Cache-Control', PUBLIC_CACHE_CONTROL);
    next();
  });

  router.get(
    '/articles',
    validate(PublicArticleListQuerySchema, 'query'),
    async (req: Request, res: Response) => {
      const result = await articleService.list(readQuery(req));
      res.json(await view.page(result));
    },
  );

  // Declared before `/articles/:slug`, which would otherwise take "popular" as a slug.
  router.get(
    '/articles/popular',
    validate(PopularArticlesQuerySchema, 'query'),
    async (req: Request, res: Response) => {
      const query = req.validatedQuery as PopularArticlesQuery;
      const body: PopularArticles = {
        data: await view.articles(await articleService.popular(query)),
      };
      res.json(body);
    },
  );

  // A reader opened an article (the reader app's beacon). Only a per-day count
  // is kept; a client past its allowance is refused, so a loop cannot pad it.
  const viewLimiter = rateLimit({
    windowMs: VIEW_WINDOW_MS,
    limit: VIEW_MAX,
    standardHeaders: true,
    legacyHeaders: false,
  });
  router.post('/articles/:id/view', viewLimiter, async (req: Request, res: Response) => {
    await articleService.recordView(requireParam(req, 'id'));
    res.status(204).end();
  });

  router.get('/articles/:slug', async (req: Request, res: Response) => {
    const slug = requireParam(req, 'slug');
    try {
      res.json(await view.article(await articleService.getBySlug(slug)));
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
      res.json(await view.page(result));
    },
  );

  // Which directly sold campaign (if any) fills this slot right now. `campaign`
  // is null rather than a 404 when there is none: that is the normal case, and
  // the reader site then renders AdSense.
  router.get(
    '/ad-campaigns/active',
    validate(ActiveAdQuerySchema, 'query'),
    async (req: Request, res: Response) => {
      const { variant } = req.validatedQuery as ActiveAdQuery;
      const body: ActiveAdResponse = {
        campaign: await presenter.ad(await adCampaignService.findActive(variant)),
      };
      res.set('Cache-Control', AD_CACHE_CONTROL);
      res.json(body);
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
