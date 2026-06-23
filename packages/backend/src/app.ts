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

const RATE_WINDOW_MS = 15 * 60 * 1000
const PUBLIC_MAX = 300
const AUTH_MAX = 20
const ADMIN_MAX = 200

/** Allow building the app with a pre-made upload service (tests inject a fake S3). */
export interface CreateAppOptions {
  uploadService?: UploadService
}

/**
 * Build the Express application. Pure with respect to I/O: it wires routes and
 * middleware but does not connect to Mongo or bind a port, so tests can mount it
 * against an in-memory database and a fake upload service.
 */
export function createApp(env: Env, options: CreateAppOptions = {}): Express {
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

  app.use(express.json({ limit: '1mb' }))

  // Distinct limiter instances with unique state per scope.
  const publicLimiter = rateLimit({ windowMs: RATE_WINDOW_MS, max: PUBLIC_MAX, standardHeaders: true, legacyHeaders: false })
  const authLimiter = rateLimit({ windowMs: RATE_WINDOW_MS, max: AUTH_MAX, standardHeaders: true, legacyHeaders: false })
  const adminLimiter = rateLimit({ windowMs: RATE_WINDOW_MS, max: ADMIN_MAX, standardHeaders: true, legacyHeaders: false })

  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({ ok: true })
  })

  const uploadService = options.uploadService ?? createUploadService(env)

  // Specific mounts first so their dedicated limiters apply without the public
  // limiter also counting the request.
  app.use('/api/auth', authLimiter, createAuthRouter(env.JWT_SECRET))
  app.use('/api/admin', adminLimiter, createAdminRouter(env.JWT_SECRET, uploadService))
  app.use('/api', publicLimiter, createPublicRouter())

  app.use(notFoundHandler)
  app.use(createErrorHandler(env.NODE_ENV === 'development'))

  return app
}
