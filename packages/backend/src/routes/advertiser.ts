import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import {
  AdAvailabilityQuerySchema,
  AdBookingInputSchema,
  AdQuoteQuerySchema,
  AdvertiserLoginInputSchema,
  AdvertiserRegisterInputSchema,
  type AdAvailabilityQuery,
  type AdBookingInput,
  type AdCreativeUpload,
  type AdQuoteQuery,
  type AdvertiserCampaignList,
  type AdvertiserLoginInput,
  type AdvertiserRegisterInput,
} from '@gwj/shared-types';
import type { AdvertiserRow } from '../db/schema/advertisers';
import { validate } from '../middleware/validate';
import { BadRequestError, UnauthorizedError } from '../errors';
import { advertiserService, advertiserToDTO } from '../services/advertiserService';
import type { AdBookingService } from '../services/adBookingService';
import { WebhookSignatureError } from '../services/stripeGateway';
import type { MediaService } from '../services/mediaService';
import { creativeDimensionsFor, requireImageFile } from './admin';

const BEARER_PREFIX = 'Bearer ';
const MAX_CREATIVE_BYTES = 5 * 1024 * 1024;
const RATE_WINDOW_MS = 15 * 60 * 1000;
/** Sign-ups and failed logins per IP per window: strict, each one costs a bcrypt hash. */
const AUTH_ATTEMPTS_MAX = 10;
const ACCOUNT_MAX = 120;
/** Availability changes the instant someone books: a few seconds of caching at most. */
const AVAILABILITY_CACHE_CONTROL = 'public, max-age=5';
const QUOTE_CACHE_CONTROL = 'public, max-age=30';

function limiter(max: number, skipSuccessfulRequests = false): RequestHandler {
  return rateLimit({
    windowMs: RATE_WINDOW_MS,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
  });
}

function requireAdvertiser(jwtSecret: string): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const header = req.header('authorization');
      const token = header?.startsWith(BEARER_PREFIX)
        ? header.slice(BEARER_PREFIX.length).trim()
        : '';
      if (!token) throw new UnauthorizedError('Missing bearer token');
      req.advertiser = await advertiserService.authenticate(token, jwtSecret);
      next();
    } catch (err) {
      next(err);
    }
  };
}

function advertiserOf(req: Request): AdvertiserRow {
  if (!req.advertiser) throw new UnauthorizedError('Not authenticated');
  return req.advertiser;
}

/** The authenticated advertiser's own API: `/api/advertiser`. */
export function createAdvertiserRouter(
  jwtSecret: string,
  media: MediaService,
  booking: AdBookingService,
): Router {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_CREATIVE_BYTES },
  });

  router.use((_req: Request, res: Response, next: NextFunction) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.post(
    '/register',
    limiter(AUTH_ATTEMPTS_MAX),
    validate(AdvertiserRegisterInputSchema),
    async (req: Request, res: Response) => {
      res
        .status(201)
        .json(await advertiserService.register(req.body as AdvertiserRegisterInput, jwtSecret));
    },
  );
  router.post(
    '/login',
    limiter(AUTH_ATTEMPTS_MAX, true),
    validate(AdvertiserLoginInputSchema),
    async (req: Request, res: Response) => {
      res.json(await advertiserService.login(req.body as AdvertiserLoginInput, jwtSecret));
    },
  );

  router.use(limiter(ACCOUNT_MAX), requireAdvertiser(jwtSecret));

  router.get('/me', (req: Request, res: Response) => {
    res.json(advertiserToDTO(advertiserOf(req)));
  });
  router.get('/campaigns', async (req: Request, res: Response) => {
    const body: AdvertiserCampaignList = {
      data: await booking.advertiserCampaigns(advertiserOf(req)),
    };
    res.json(body);
  });
  router.post(
    '/creative',
    (req: Request, res: Response, next: NextFunction) => {
      upload.single('file')(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError)
          next(new BadRequestError(`Upload rejected: ${err.message}`));
        else next(err);
      });
    },
    async (req: Request, res: Response) => {
      const dimensions = creativeDimensionsFor(req.query.variant ?? req.body?.variant);
      const file = requireImageFile(req, dimensions);
      const result: AdCreativeUpload = await media.upload(
        file.buffer,
        file.originalname,
        file.mimetype,
        { uploadedBy: `advertiser:${advertiserOf(req).id}`, dimensions },
      );
      res.status(201).json(result);
    },
  );
  router.post('/bookings', validate(AdBookingInputSchema), async (req: Request, res: Response) => {
    res.status(201).json(await booking.reserve(advertiserOf(req), req.body as AdBookingInput));
  });
  return router;
}

/** Public, unauthenticated slot calendar and price: `/api/ads`. */
export function createAdsPublicRouter(booking: AdBookingService): Router {
  const router = Router();
  router.get(
    '/availability',
    validate(AdAvailabilityQuerySchema, 'query'),
    async (req: Request, res: Response) => {
      res.set('Cache-Control', AVAILABILITY_CACHE_CONTROL);
      res.json(await booking.availability(req.validatedQuery as AdAvailabilityQuery));
    },
  );
  router.get('/quote', validate(AdQuoteQuerySchema, 'query'), (req: Request, res: Response) => {
    res.set('Cache-Control', QUOTE_CACHE_CONTROL);
    res.json(booking.quote(req.validatedQuery as AdQuoteQuery));
  });
  return router;
}

/**
 * The Stripe webhook handler. Needs the exact request bytes (the signature covers
 * them), so it is mounted with `express.raw` BEFORE the global JSON parser.
 */
export function stripeWebhookHandler(booking: AdBookingService): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const signature = req.header('stripe-signature');
      if (!signature || !Buffer.isBuffer(req.body)) {
        throw new BadRequestError('Missing Stripe signature');
      }
      await booking.handleWebhook(req.body, signature);
      res.json({ received: true });
    } catch (err) {
      next(err instanceof WebhookSignatureError ? new BadRequestError('Invalid signature') : err);
    }
  };
}
