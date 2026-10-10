import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import type { Health } from '@gwj/shared-types';
import { parseCorsOrigins, type Env } from './env';
import { createPublicRouter } from './routes/public';
import { createAuthRouter } from './routes/auth';
import { createAdminRouter } from './routes/admin';
import { createUploadService, type UploadService } from './services/uploadService';
import { type RemoteImageOptions } from './services/remoteImageService';
import { sql } from 'drizzle-orm';
import { createErrorHandler, notFoundHandler } from './middleware/error';
import { requestLog } from './middleware/requestLog';
import { getDb } from './db/client';
import { errorFields, logger } from './logger';
import { createActivityPub, type ActivityPubModule, type ActivityPubOptions } from './activitypub';
import { startChannels } from './channels';

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
}

/** The Express app, the ActivityPub module, and the channel publishing handle. */
export interface BuiltApp {
  app: Express;
  activityPub: ActivityPubModule;
  /**
   * Stop distribution-channel publishing (unsubscribe from article-published
   * transitions). Call at graceful shutdown, and in tests that build multiple app
   * instances so a stale listener doesn't fan out across instances.
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
 * It also starts distribution-channel publishing (Mastodon + Telegram): the channel
 * registry owns the single article-published subscription and routes each published
 * article to every enabled channel that serves its edition. Stop it via
 * {@link BuiltApp.stopChannels}.
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

  // The channel registry owns the single article-published subscription and fans
  // each published article out to the Mastodon + Telegram channels by edition.
  const stopChannels = startChannels(env, activityPub);

  app.use(express.json({ limit: '1mb' }));

  const uploadService = options.uploadService ?? createUploadService(env);

  // Specific mounts first so their dedicated limiters apply without the public
  // limiter also counting the request.
  app.use('/api/auth', authLimiter, createAuthRouter(env.JWT_SECRET));
  app.use(
    '/api/admin',
    adminLimiter,
    createAdminRouter(env.JWT_SECRET, uploadService, options.remoteImage),
  );
  app.use('/api', publicLimiter, createPublicRouter());

  app.use(notFoundHandler);
  app.use(createErrorHandler(env.NODE_ENV === 'development'));

  return { app, activityPub, stopChannels };
}

/**
 * Convenience builder returning just the Express app. The ActivityPub signing key
 * is resolved lazily on first boot via {@link buildApp}'s module; callers that need
 * to drive initialization explicitly (the bootstrap) should use {@link buildApp}.
 */
export function createApp(env: Env, options: CreateAppOptions = {}): Express {
  return buildApp(env, options).app;
}
