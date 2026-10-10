import { config as loadDotenv } from 'dotenv'
import { z } from 'zod'
import { TELEGRAM_CHANNEL_HANDLE } from '@gwj/shared-types'

/**
 * Reject placeholder secret values. A secret set to `'-'` or empty string is a
 * deploy-time footgun (it silently overwrites real config), so we treat those as
 * "missing" rather than valid.
 */
const requiredSecret = (name: string) =>
  z
    .string()
    .min(1, `${name} is required`)
    .refine((v) => v !== '-', `${name} must not be the placeholder '-'`)

/**
 * An optional secret. Absent OR empty string is treated as "not provided"
 * (→ `undefined`), so a `.env` copied from `.env.example` with blank values boots
 * fine. When a NON-empty value is provided, the placeholder `'-'` is rejected.
 * Used for static AWS keys, which are only needed for local dev — in production
 * (ECS Fargate) the SDK uses the task role via the default credential chain.
 */
const optionalSecret = (name: string) =>
  z
    .string()
    .transform((v) => (v.length === 0 ? undefined : v))
    .refine((v) => v !== '-', `${name} must not be the placeholder '-'`)
    .optional()

const DEFAULT_PORT = 4000

/** Default apex domain where the fediverse handles live (`@<user>@<domain>`). */
const DEFAULT_FEDIVERSE_DOMAIN = 'globalworldjournal.com'

/**
 * Parse the optional `FEDIVERSE_EDITION_USERNAMES` override: a JSON object mapping
 * a subset of language codes to usernames (e.g. `{"es":"noticias"}`). Empty/absent
 * → undefined (defaults apply). Usernames must be plain lowercase `[a-z0-9]` so the
 * handle `@<username>@<domain>` is valid. Throws (via Zod) on malformed input so a
 * bad config fails fast at boot rather than minting broken actor ids.
 */
const editionUsernamesOverride = z
  .string()
  .transform((v) => v.trim())
  .transform((v, ctx) => {
    if (v.length === 0) return undefined
    let parsed: unknown
    try {
      parsed = JSON.parse(v)
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'must be valid JSON' })
      return z.NEVER
    }
    const result = z.record(z.string(), z.string().regex(/^[a-z0-9]+$/)).safeParse(parsed)
    if (!result.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'must map language codes to plain lowercase [a-z0-9] usernames',
      })
      return z.NEVER
    }
    return result.data
  })
  .optional()

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(DEFAULT_PORT),
  // PostgreSQL connection string (logical database `gwj` on the shared RDS
  // instance in production; `?sslmode=require` there).
  DATABASE_URL: requiredSecret('DATABASE_URL').refine(
    (v) => /^postgres(ql)?:\/\//.test(v),
    'DATABASE_URL must be a postgres:// or postgresql:// URL',
  ),
  JWT_SECRET: requiredSecret('JWT_SECRET'),
  ADMIN_USERNAME: requiredSecret('ADMIN_USERNAME'),
  ADMIN_PASSWORD: requiredSecret('ADMIN_PASSWORD'),
  AWS_REGION: requiredSecret('AWS_REGION'),
  AWS_ACCESS_KEY_ID: optionalSecret('AWS_ACCESS_KEY_ID'),
  AWS_SECRET_ACCESS_KEY: optionalSecret('AWS_SECRET_ACCESS_KEY'),
  S3_BUCKET: requiredSecret('S3_BUCKET'),
  CDN_BASE_URL: requiredSecret('CDN_BASE_URL').refine(
    (v) => /^https?:\/\//.test(v),
    'CDN_BASE_URL must be an absolute http(s) URL',
  ),
  CORS_ORIGINS: z.string().default(''),
  // How many reverse proxies sit in front of the app and append to
  // X-Forwarded-For. Production: 1 (the ALB — api.* is DNS-only, not proxied
  // through Cloudflare). Without it `req.ip` is the ALB's address, so every
  // reader shares ONE rate-limit bucket and anyone can lock the admin out of login.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),

  // --- ActivityPub / fediverse federation ---
  // The handles live on the APEX domain (`@news@globalworldjournal.com`), so every
  // AP `id`/URL is generated from this value — NEVER from the request host (this
  // backend runs at api.globalworldjournal.com but the apex proxies AP paths here).
  FEDIVERSE_DOMAIN: z
    .string()
    .default(DEFAULT_FEDIVERSE_DOMAIN)
    .transform((v) => v.trim().replace(/^https?:\/\//, '').replace(/\/+$/, ''))
    .refine((v) => v.length > 0, 'FEDIVERSE_DOMAIN must not be empty')
    .refine((v) => !v.includes('/'), 'FEDIVERSE_DOMAIN must be a bare domain (no path)'),
  // Optional per-edition username override (JSON map). Absent → canonical defaults
  // (en→news, es→noticias, fr→actualites). Writers are derived from the roster.
  FEDIVERSE_EDITION_USERNAMES: editionUsernamesOverride,

  // --- Telegram distribution channel ---
  // The bot token authorizes posting to the channel. OPTIONAL: when absent (or
  // empty), the Telegram channel is disabled and publishing is a safe no-op — the
  // backend boots fine without it. A NON-empty placeholder `'-'` is rejected.
  TELEGRAM_BOT_TOKEN: optionalSecret('TELEGRAM_BOT_TOKEN'),
  // Target channel for posts. Defaults to the canonical public handle
  // (`@GWJOfficial`); override for a different channel/numeric chat id.
  TELEGRAM_CHANNEL: z
    .string()
    .transform((v) => v.trim())
    .transform((v) => (v.length === 0 ? TELEGRAM_CHANNEL_HANDLE : v))
    .default(TELEGRAM_CHANNEL_HANDLE),
})

/**
 * Cross-field rules. In production an empty CORS allowlist is a misconfiguration
 * (it would otherwise mean "no browser origin may call the API"), so fail at boot
 * rather than serve a site whose own pages are refused.
 */
const RefinedEnvSchema = EnvSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV === 'production' && parseCorsOrigins(env.CORS_ORIGINS).length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['CORS_ORIGINS'],
      message: 'CORS_ORIGINS must list at least one origin in production',
    })
  }
})

export type Env = z.infer<typeof EnvSchema>

let cached: Env | null = null

/**
 * Parse and validate environment configuration.
 *
 * Lazy by design: configuration is read on first call (typically at bootstrap),
 * not at import time, so tests can inject `process.env` before invoking it.
 * Throws with a readable message listing every missing/invalid variable.
 */
export function loadEnv(): Env {
  if (cached) return cached
  loadDotenv()
  const parsed = RefinedEnvSchema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }
  cached = parsed.data
  return cached
}

/** Reset the cached env. Test-only helper for re-evaluating after mutating process.env. */
export function resetEnvCache(): void {
  cached = null
}

/** Parse the CORS_ORIGINS comma-separated allowlist into a trimmed, non-empty array. */
export function parseCorsOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0)
}
