import express, { type Express, type Request, type Response } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { parseCorsOrigins, type Env } from './env'
import { createPublicRouter } from './routes/public'
import { createAuthRouter } from './routes/auth'
import { createAdminRouter } from './routes/admin'
import { createUploadService, type UploadService } from './services/uploadService'
import { createErrorHandler, notFoundHandler } from './middleware/error'
import { createActivityPub, type ActivityPubModule, type ActivityPubOptions } from './activitypub'

const RATE_WINDOW_MS = 15 * 60 * 1000
const PUBLIC_MAX = 300
const AUTH_MAX = 20
const ADMIN_MAX = 200
/** Generous limiter for unauthenticated federation traffic (crawls, fan-in). */
const FEDERATION_MAX = 600

/** Allow building the app with a pre-made upload service (tests inject a fake S3). */
export interface CreateAppOptions {
  uploadService?: UploadService
  /** Options forwarded to the ActivityPub module (test seams for key/fetch). */
  activityPub?: ActivityPubOptions
}

/** The Express app plus the ActivityPub module, so the bootstrap can initialize it. */
export interface BuiltApp {
  app: Express
  activityPub: ActivityPubModule
}

/**
 * Build the Express application AND the ActivityPub module. Pure with respect to
 * I/O: it wires routes and middleware but does not connect to Mongo or bind a
 * port, so tests can mount it against an in-memory database and a fake upload
 * service. The caller must `await activityPub.initialize()` once Mongo is
 * connected so the signing key is resolved.
 */
export function buildApp(env: Env, options: CreateAppOptions = {}): BuiltApp {
  const app = express()

  app.use(helmet())

  const allowlist = parseCorsOrigins(env.CORS_ORIGINS)
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow non-browser clients (no Origin header) and any allowlisted origin.
        if (!origin || allowlist.length === 0 || allowlist.includes(origin)) {
          callback(null, true)
          return
        }
        callback(new Error('Not allowed by CORS'))
      },
      credentials: true,
    }),
  )

  // Distinct limiter instances with unique state per scope.
  const publicLimiter = rateLimit({ windowMs: RATE_WINDOW_MS, max: PUBLIC_MAX, standardHeaders: true, legacyHeaders: false })
  const authLimiter = rateLimit({ windowMs: RATE_WINDOW_MS, max: AUTH_MAX, standardHeaders: true, legacyHeaders: false })
  const adminLimiter = rateLimit({ windowMs: RATE_WINDOW_MS, max: ADMIN_MAX, standardHeaders: true, legacyHeaders: false })
  const federationLimiter = rateLimit({ windowMs: RATE_WINDOW_MS, max: FEDERATION_MAX, standardHeaders: true, legacyHeaders: false })

  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({ ok: true })
  })

  // ActivityPub is mounted BEFORE the global JSON body parser: its inbox routes
  // need the raw request bytes to verify the HTTP Signature Digest, so they apply
  // their own raw parser. Its ids are apex-anchored (host-independent).
  const activityPub = createActivityPub(env, options.activityPub)
  app.use(federationLimiter, activityPub.router)

  app.use(express.json({ limit: '1mb' }))

  const uploadService = options.uploadService ?? createUploadService(env)

  // Specific mounts first so their dedicated limiters apply without the public
  // limiter also counting the request.
  app.use('/api/auth', authLimiter, createAuthRouter(env.JWT_SECRET))
  app.use('/api/admin', adminLimiter, createAdminRouter(env.JWT_SECRET, uploadService))
  app.use('/api', publicLimiter, createPublicRouter())

  app.use(notFoundHandler)
  app.use(createErrorHandler(env.NODE_ENV === 'development'))

  return { app, activityPub }
}

/**
 * Convenience builder returning just the Express app. The ActivityPub signing key
 * is resolved lazily on first boot via {@link buildApp}'s module; callers that need
 * to drive initialization explicitly (the bootstrap) should use {@link buildApp}.
 */
export function createApp(env: Env, options: CreateAppOptions = {}): Express {
  return buildApp(env, options).app
}
