import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import type { Health } from '@gwj/shared-types';
import { parseCorsOrigins, type Env } from './env';
import { createPublicRouter } from './routes/public';
import { createAuthRouter } from './routes/auth';
import { createAdminRouter } from './routes/admin';
import { createMentionOauthRouter } from './routes/mentionOauth';
import {
  createAdsPublicRouter,
  createAdvertiserRouter,
  stripeWebhookHandler,
} from './routes/advertiser';
import { createAdBookingService } from './services/adBookingService';
import { createStripeGateway, type StripeGateway } from './services/stripeGateway';
import { createUploadService, type UploadService } from './services/uploadService';
import type { RemoteImageOptions } from './services/remoteImageService';
import { sql } from 'drizzle-orm';
import { createErrorHandler, notFoundHandler } from './middleware/error';
import { requestLog } from './middleware/requestLog';
import { getDb } from './db/client';
import { errorFields, logger } from './logger';
import { createActivityPub, type ActivityPubModule, type ActivityPubOptions } from './activitypub';
import { buildChannels } from './channels';
import { registerChannels } from './channels/registry';
import { startMentionGrantCache } from './channels/mentionOauthService';
import type { PublishChannel } from './channels/types';
import { createEmailSender, type EmailSender } from './services/emailSender';
import { createNewsletterService, type NewsletterService } from './services/newsletterService';
import { createNewsletterRouter } from './routes/newsletter';

const RATE_WINDOW_MS = 15 * 60 * 1000;
const PUBLIC_MAX = 300;
const AUTH_MAX = 20;
const ADMIN_MAX = 200;
/** Generous limiter for unauthenticated federation traffic (crawls, fan-in). */
const FEDERATION_MAX = 600;

/** Allow building the app with a pre-made upload service (tests inject a fake S3). */
export interface CreateAppOptions {
  uploadService?: UploadService;
  /** Options forwarded to the ActivityPub module (test seams for key/fetch). */
  activityPub?: ActivityPubOptions;
  /** Test seams (fetch, DNS) for downloading remote images in `upload/from-url`. */
  remoteImage?: RemoteImageOptions;
  /** Test seam: replaces the Stripe gateway (an external paid API). */
  stripeGateway?: StripeGateway;
  /** Test seam: replaces the newsletter's email provider (Amazon SES). */
  emailSender?: EmailSender;
}

/** The Express app, the ActivityPub module, and the distribution channels. */
export interface BuiltApp {
  app: Express;
  activityPub: ActivityPubModule;
  /** The newsletter: its subscriber service and email provider (the sender worker uses them). */
  newsletter: { service: NewsletterService; sender: EmailSender };
  /** The distribution channels article changes are queued for (the outbox works them). */
  channels: readonly PublishChannel[];
  /**
   * Stop queueing distribution jobs for these channels. Call at graceful
   * shutdown, and in tests that build multiple app instances so a stale planner
   * doesn't queue jobs for another instance's channels.
   */
  stopChannels(): void;
}

/**
 * Build the Express application AND the ActivityPub module. Pure with respect to
 * I/O: it wires routes and middleware but does not open the database pool or bind
 * a port, so tests can mount it against a throwaway PostgreSQL database and a fake
 * upload service. The caller connects the pool first (`connectDb`); actor signing
 * keys are then resolved lazily on first use.
 *
 * It also registers the distribution channels (Mastodon + Telegram): from then on
 * every article change queues its distribution jobs for the enabled channels
 * serving its edition. The jobs are worked by the outbox worker, which the server
 * entry point starts (channels/outbox.ts). Stop it via {@link BuiltApp.stopChannels}.
 */
export function buildApp(env: Env, options: CreateAppOptions = {}): BuiltApp {
  const app = express();
  // Resolve `req.ip` from X-Forwarded-For across exactly the proxies we run behind,
  // so the rate limiters key on the real client rather than the load balancer.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  app.use(requestLog());
  app.use(helmet());

  const allowlist = parseCorsOrigins(env.CORS_ORIGINS);
  app.use(
    cors({
      // Non-browser clients send no Origin and are unaffected. A browser origin off
      // the allowlist simply gets no CORS headers (the browser blocks the read);
      // it is a refusal, not a server error. An empty allowlist (dev only — boot
      // rejects it in production) allows every origin.
      origin: (origin, callback) => {
        callback(null, !origin || allowlist.length === 0 || allowlist.includes(origin));
      },
      credentials: true,
    }),
  );

  // Distinct limiter instances with unique state per scope.
  const publicLimiter = rateLimit({
    windowMs: RATE_WINDOW_MS,
    max: PUBLIC_MAX,
    standardHeaders: true,
    legacyHeaders: false,
  });
  // Brute-force protection: only FAILED logins count, so an admin (or the MCP
  // server re-authenticating) is never locked out by successful sign-ins.
  const authLimiter = rateLimit({
    windowMs: RATE_WINDOW_MS,
    max: AUTH_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
  });
  const adminLimiter = rateLimit({
    windowMs: RATE_WINDOW_MS,
    max: ADMIN_MAX,
    standardHeaders: true,
    legacyHeaders: false,
  });
  const federationLimiter = rateLimit({
    windowMs: RATE_WINDOW_MS,
    max: FEDERATION_MAX,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const health: Health = { ok: true, release: env.GWJ_RELEASE ?? null };
  // Liveness for the ALB: the process serves HTTP. Deliberately NOT tied to the
  // database, so a database blip does not make the ALB cycle every task.
  app.get('/healthz', (_req: Request, res: Response) => {
    res.json(health);
  });

  // Readiness: the process can reach PostgreSQL. For deploy checks and alarms.
  app.get('/readyz', async (_req: Request, res: Response) => {
    try {
      await getDb().execute(sql`select 1`);
      res.json(health);
    } catch (err) {
      logger.error('readiness check failed', errorFields(err));
      res.status(503).json({ ok: false, release: health.release });
    }
  });

  // ActivityPub is mounted BEFORE the global JSON body parser: its inbox routes
  // need the raw request bytes to verify the HTTP Signature Digest, so they apply
  // their own raw parser. Its ids are apex-anchored (host-independent).
  const activityPub = createActivityPub(env, options.activityPub);
  app.use(federationLimiter, activityPub.router);

  // Built before the channels: Instagram's channel reuses this exact
  // instance to store its generated social cards, rather than opening a
  // second S3 client.
  const uploadService = options.uploadService ?? createUploadService(env);

  // Article changes queue their distribution to these channels, by edition.
  const channels = buildChannels(env, activityPub, uploadService);
  const unregisterChannels = registerChannels(channels);
  // Mention's own `isEnabled()` must answer synchronously (the registry calls
  // it inside the transaction that queues each change's delivery jobs), so
  // whether a grant is stored is cached in-process rather than looked up live.
  const stopMentionGrantCache = startMentionGrantCache();
  const stopChannels = (): void => {
    unregisterChannels();
    stopMentionGrantCache();
  };

  // Self-serve ads. Payments run only when both Stripe secrets are set.
  const stripeGateway =
    options.stripeGateway ??
    (env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET
      ? createStripeGateway(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET)
      : null);
  const adBooking = createAdBookingService({
    gateway: stripeGateway,
    siteUrl: env.PUBLIC_SITE_URL ?? `https://${env.FEDIVERSE_DOMAIN}`,
    cdnBaseUrl: env.CDN_BASE_URL,
  });
  // Stripe signs the exact bytes it sends, so the webhook takes a raw body and
  // must come BEFORE the JSON parser. The signature (not a rate limit) guards it.
  app.post(
    '/api/stripe/webhook',
    express.raw({ type: 'application/json', limit: '1mb' }),
    stripeWebhookHandler(adBooking),
  );

  app.use(express.json({ limit: '1mb' }));

  // Specific mounts first so their dedicated limiters apply without the public
  // limiter also counting the request.
  app.use('/api/auth', authLimiter, createAuthRouter(env.JWT_SECRET));
  app.use(
    '/api/admin',
    adminLimiter,
    createAdminRouter(env, env.JWT_SECRET, uploadService, options.remoteImage),
  );
  // Public: Mention's own redirect lands here directly, carrying no admin
  // session of ours (see routes/mentionOauth.ts for why `state` alone is
  // this route's real security control).
  const emailSender = options.emailSender ?? createEmailSender(env);
  const newsletter = createNewsletterService({
    sender: emailSender,
    secret: env.JWT_SECRET,
    domain: env.FEDIVERSE_DOMAIN,
  });
  app.use('/api/newsletter', createNewsletterRouter(newsletter));
  app.use('/api/advertiser', createAdvertiserRouter(env.JWT_SECRET, uploadService, adBooking));
  app.use('/api/ads', publicLimiter, createAdsPublicRouter(adBooking));
  app.use('/api/mention', publicLimiter, createMentionOauthRouter(env));
  app.use('/api', publicLimiter, createPublicRouter());

  app.use(notFoundHandler);
  app.use(createErrorHandler(env.NODE_ENV === 'development'));

  return {
    app,
    activityPub,
    channels,
    stopChannels,
    newsletter: { service: newsletter, sender: emailSender },
  };
}

/**
 * Convenience builder returning just the Express app. The ActivityPub signing key
 * is resolved lazily on first boot via {@link buildApp}'s module; callers that need
 * to drive initialization explicitly (the bootstrap) should use {@link buildApp}.
 */
export function createApp(env: Env, options: CreateAppOptions = {}): Express {
  return buildApp(env, options).app;
}
