import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import {
  AD_CREATIVE_ASPECT_RATIOS,
  AD_CREATIVE_MIN_HEIGHT,
  AD_CREATIVE_MIN_WIDTH,
  AdCampaignInputSchema,
  AdVariantSchema,
  AdCampaignListQuerySchema,
  AdCampaignUpdateSchema,
  ArticleInputSchema,
  ArticleListQuerySchema,
  ArticleUpdateSchema,
  CorrectionInputSchema,
  CreateApiTokenInputSchema,
  TakedownActionSchema,
  TakedownListQuerySchema,
  UploadFromUrlInputSchema,
  type AdCampaignInput,
  type AdCampaignListQuery,
  type AdCampaignUpdate,
  type ArticleInput,
  type ArticleListQuery,
  type ArticleUpdate,
  type CorrectionInput,
  type CreateApiTokenInput,
  type TakedownAction,
  type TakedownListQuery,
  type UploadFromUrlInput,
} from '@gwj/shared-types';
import { validateImageBuffer, type ValidateImageOptions } from '@gwj/shared-types/image-validation';
import { adCampaignService } from '../services/adCampaignService';
import { articleService } from '../services/articleService';
import { takedownService } from '../services/takedownService';
import { beginAuthorization } from '../channels/mentionOauthService';
import type { Env } from '../env';
import { createMediaService } from '../services/mediaService';
import type { UploadImageOptions, UploadService } from '../services/uploadService';
import { fetchRemoteImage, type RemoteImageOptions } from '../services/remoteImageService';
import {
  assertScope,
  principalOf,
  requireAuth,
  requireScope,
  requireUser,
} from '../middleware/auth';
import { actorName } from '../auth/principal';
import { apiTokenService } from '../services/apiTokenService';
import { validate } from '../middleware/validate';
import { requireParam } from '../middleware/params';
import { BadRequestError, NotFoundError, UnprocessableEntityError } from '../errors';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Who is making this change, for the article history (an admin, or agent:<name>). */
function actorOf(req: Request): string {
  return actorName(principalOf(req));
}

/** A revision id path parameter; anything but a positive integer is a 404. */
function revisionIdOf(req: Request): number {
  const value = Number(requireParam(req, 'revisionId'));
  if (!Number.isSafeInteger(value) || value < 1) throw new NotFoundError('Revision not found');
  return value;
}

/**
 * The uploaded file, validated at the request boundary so a bad upload gets an
 * actionable 422 (the agent/admin can re-source the image) before any S3 work.
 * The upload service validates again as the authoritative last line of defense.
 */
function requireImageFile(
  req: Request,
  dimensions: Pick<ValidateImageOptions, 'minWidth' | 'minHeight' | 'aspectRatio'> = {},
): Express.Multer.File {
  const file = req.file;
  if (!file) throw new BadRequestError('No file uploaded (expected field "file")');
  const validation = validateImageBuffer(file.buffer, {
    declaredMime: file.mimetype,
    ...dimensions,
  });
  if (!validation.ok) {
    throw new UnprocessableEntityError(`Rejected image upload: ${validation.message}`, {
      reason: validation.reason,
    });
  }
  return file;
}

/** Ad creatives are banner-sized, far below the article-image floor. */
const AD_CREATIVE_DIMENSIONS: UploadImageOptions = {
  minWidth: AD_CREATIVE_MIN_WIDTH,
  minHeight: AD_CREATIVE_MIN_HEIGHT,
};

/**
 * The creative-upload options for a given slot: the shared size floor, plus
 * that variant's target shape (if it has one — `inline` doesn't, see
 * {@link AD_CREATIVE_ASPECT_RATIOS}). An unrecognized/missing `variant` field
 * just skips the shape check rather than failing the upload, since the
 * variant isn't known yet at the point a campaign's creative is first picked.
 */
function creativeDimensionsFor(rawVariant: unknown): UploadImageOptions {
  const variant = AdVariantSchema.safeParse(rawVariant);
  if (!variant.success) return AD_CREATIVE_DIMENSIONS;
  const aspectRatio = AD_CREATIVE_ASPECT_RATIOS[variant.data];
  return aspectRatio ? { ...AD_CREATIVE_DIMENSIONS, aspectRatio } : AD_CREATIVE_DIMENSIONS;
}

export function createAdminRouter(
  env: Env,
  jwtSecret: string,
  uploadService: UploadService,
  remoteImage: RemoteImageOptions = {},
): Router {
  const router = Router();
  const media = createMediaService(uploadService);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES },
  });

  // Authenticated, per-user and often drafts: never stored by any cache.
  router.use((_req: Request, res: Response, next: NextFunction) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(requireAuth(jwtSecret));

  router.get(
    '/articles',
    validate(ArticleListQuerySchema, 'query'),
    async (req: Request, res: Response) => {
      const query = req.validatedQuery as ArticleListQuery;
      // Admin listing shows ALL statuses (incl. drafts) unless one is explicitly requested.
      const result = await articleService.list(query, { includeAll: true });
      res.json(result);
    },
  );

  router.post('/articles', validate(ArticleInputSchema), async (req: Request, res: Response) => {
    const input = req.body as ArticleInput;
    assertScope(req, 'articles:write');
    if (input.status === 'published') assertScope(req, 'articles:publish');
    const article = await articleService.create(input);
    res.status(201).json(article);
  });

  // Registered BEFORE `/articles/:id` so the literal `by-slug` segment is not
  // captured by the `:id` param. Both single-get routes include drafts.
  router.get('/articles/by-slug/:slug', async (req: Request, res: Response) => {
    const article = await articleService.getBySlug(requireParam(req, 'slug'), {
      includeDrafts: true,
    });
    res.json(article);
  });

  router.get('/articles/:id', async (req: Request, res: Response) => {
    const article = await articleService.getById(requireParam(req, 'id'));
    res.json(article);
  });

  router.patch(
    '/articles/:id',
    validate(ArticleUpdateSchema),
    requireScope('articles:write'),
    async (req: Request, res: Response) => {
      const patch = req.body as ArticleUpdate;
      if (patch.status === 'published') assertScope(req, 'articles:publish');
      const article = await articleService.update(requireParam(req, 'id'), patch, actorOf(req));
      res.json(article);
    },
  );

  router.delete(
    '/articles/:id',
    requireScope('articles:delete'),
    async (req: Request, res: Response) => {
      await articleService.remove(requireParam(req, 'id'));
      res.status(204).end();
    },
  );

  router.post(
    '/articles/:id/publish',
    requireScope('articles:publish'),
    async (req: Request, res: Response) => {
      const article = await articleService.publish(requireParam(req, 'id'), actorOf(req));
      res.json(article);
    },
  );

  router.post(
    '/articles/:id/unpublish',
    requireScope('articles:publish'),
    async (req: Request, res: Response) => {
      const article = await articleService.unpublish(requireParam(req, 'id'), actorOf(req));
      res.json(article);
    },
  );

  router.post(
    '/articles/:id/corrections',
    validate(CorrectionInputSchema),
    requireScope('articles:write'),
    async (req: Request, res: Response) => {
      const { text } = req.body as CorrectionInput;
      res.json(await articleService.addCorrection(requireParam(req, 'id'), text, actorOf(req)));
    },
  );

  router.get('/articles/:id/revisions', async (req: Request, res: Response) => {
    res.json(await articleService.listRevisions(requireParam(req, 'id')));
  });

  router.get('/articles/:id/revisions/:revisionId', async (req: Request, res: Response) => {
    res.json(await articleService.getRevision(requireParam(req, 'id'), revisionIdOf(req)));
  });

  router.post(
    '/articles/:id/revisions/:revisionId/restore',
    requireScope('articles:write'),
    async (req: Request, res: Response) => {
      const article = await articleService.restoreRevision(
        requireParam(req, 'id'),
        revisionIdOf(req),
        actorOf(req),
      );
      res.json(article);
    },
  );

  router.post(
    '/upload',
    requireScope('media:upload'),
    upload.single('file'),
    async (req: Request, res: Response) => {
      // Defaults enforce the canonical min width/height and byte cap.
      const file = requireImageFile(req);
      const result = await media.upload(file.buffer, file.originalname, file.mimetype);
      res.status(201).json(result);
    },
  );

  // Copy a remote image (e.g. a source's og:image) onto our CDN. The download
  // happens HERE, behind the SSRF guard, a timeout and a streaming size cap, so
  // no other service needs to fetch arbitrary URLs.
  router.post(
    '/upload/from-url',
    requireScope('media:upload'),
    validate(UploadFromUrlInputSchema),
    async (req: Request, res: Response) => {
      const input = req.body as UploadFromUrlInput;
      const image = await fetchRemoteImage(input.url, input.filename, remoteImage);
      const result = await media.upload(image.buffer, image.filename, image.mime);
      res.status(201).json(result);
    },
  );

  // Requests carry requesters' names and emails: agents need the scope even to read.
  router.use('/takedown-requests', requireScope('takedowns'));
  router.get(
    '/takedown-requests',
    validate(TakedownListQuerySchema, 'query'),
    async (req: Request, res: Response) => {
      const query = req.validatedQuery as TakedownListQuery;
      const result = await takedownService.list(query);
      res.json(result);
    },
  );

  router.get('/takedown-requests/:id', async (req: Request, res: Response) => {
    const record = await takedownService.getById(requireParam(req, 'id'));
    res.json(record);
  });

  router.post(
    '/takedown-requests/:id/action',
    validate(TakedownActionSchema),
    async (req: Request, res: Response) => {
      const record = await takedownService.action(
        requireParam(req, 'id'),
        req.body as TakedownAction,
        actorOf(req),
      );
      res.json(record);
    },
  );

  // Directly sold ads carry advertisers' contacts and the paper's revenue:
  // people only, never an agent token, whatever its scopes.
  router.use('/ad-campaigns', requireUser());
  router.get(
    '/ad-campaigns',
    validate(AdCampaignListQuerySchema, 'query'),
    async (req: Request, res: Response) => {
      res.json(await adCampaignService.list(req.validatedQuery as AdCampaignListQuery));
    },
  );
  router.post(
    '/ad-campaigns',
    validate(AdCampaignInputSchema),
    async (req: Request, res: Response) => {
      res.status(201).json(await adCampaignService.create(req.body as AdCampaignInput));
    },
  );
  // The creative goes through the same S3/CDN pipeline as article images, with
  // the banner-sized floor; the returned URL is then saved as `imageUrl`.
  router.post(
    '/ad-campaigns/creative',
    upload.single('file'),
    async (req: Request, res: Response) => {
      const dimensions = creativeDimensionsFor(req.body?.variant);
      const file = requireImageFile(req, dimensions);
      const result = await uploadService.uploadImage(
        file.buffer,
        file.originalname,
        file.mimetype,
        dimensions,
      );
      res.status(201).json(result);
    },
  );
  router.get('/ad-campaigns/:id', async (req: Request, res: Response) => {
    res.json(await adCampaignService.getById(requireParam(req, 'id')));
  });
  router.patch(
    '/ad-campaigns/:id',
    validate(AdCampaignUpdateSchema),
    async (req: Request, res: Response) => {
      const patch = req.body as AdCampaignUpdate;
      res.json(await adCampaignService.update(requireParam(req, 'id'), patch));
    },
  );
  router.delete('/ad-campaigns/:id', async (req: Request, res: Response) => {
    await adCampaignService.remove(requireParam(req, 'id'));
    res.status(204).end();
  });

  // Agent credentials are managed by people only, never by an agent.
  router.get('/tokens', requireUser(), async (_req: Request, res: Response) => {
    res.json(await apiTokenService.list());
  });
  router.post(
    '/tokens',
    requireUser(),
    validate(CreateApiTokenInputSchema),
    async (req: Request, res: Response) => {
      res.status(201).json(await apiTokenService.create(req.body as CreateApiTokenInput));
    },
  );
  router.post('/tokens/:id/revoke', requireUser(), async (req: Request, res: Response) => {
    res.json(await apiTokenService.revoke(requireParam(req, 'id')));
  });

  // One-time (or, if the grant is ever genuinely revoked, occasional) setup:
  // an admin visits this, opens the returned URL, and approves it signed in
  // as @gwj. From then on the Mention channel renews itself forever — see
  // channels/mentionOauthService.ts. The callback itself (routes/mentionOauth.ts)
  // is NOT on this router: Mention's own redirect lands straight from the
  // admin's browser, carrying no admin session of ours to require.
  router.get('/mention/connect', requireUser(), async (_req: Request, res: Response) => {
    res.json(await beginAuthorization(env));
  });

  return router;
}
