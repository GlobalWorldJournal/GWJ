import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadEnv, resetEnvCache } from '../env'

/** A complete, valid env WITHOUT the optional AWS static keys. */
function baseEnv(): Record<string, string> {
  return {
    NODE_ENV: 'test',
    PORT: '4000',
    DATABASE_URL: 'postgres://gwj:gwj@localhost:5432/gwj_test',
    JWT_SECRET: 'test-jwt-secret',
    ADMIN_USERNAME: 'nate',
    ADMIN_PASSWORD: 'super-secret-pw',
    AWS_REGION: 'us-east-1',
    S3_BUCKET: 'test-bucket',
    CDN_BASE_URL: 'https://cdn.example.test',
    CORS_ORIGINS: 'https://globalworldjournal.com',
  }
}

const AWS_KEYS = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'NODE_ENV',
  'PORT',
  'DATABASE_URL',
  'MONGO_URI',
  'JWT_SECRET',
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD',
  'AWS_REGION',
  'S3_BUCKET',
  'CDN_BASE_URL',
  'CORS_ORIGINS',
  'TRUST_PROXY_HOPS',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHANNEL',
]

function applyEnv(values: Record<string, string>): void {
  for (const key of AWS_KEYS) delete process.env[key]
  for (const [key, value] of Object.entries(values)) process.env[key] = value
  resetEnvCache()
}

const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of AWS_KEYS) saved[key] = process.env[key]
})

afterEach(() => {
  for (const key of AWS_KEYS) {
    const prev = saved[key]
    if (prev === undefined) delete process.env[key]
    else process.env[key] = prev
  }
  resetEnvCache()
})

describe('env — AWS credentials are optional (ECS task role)', () => {
  it('loads with AWS keys absent (production / task-role path)', () => {
    applyEnv(baseEnv())
    const env = loadEnv()
    expect(env.AWS_ACCESS_KEY_ID).toBeUndefined()
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined()
    // Required AWS-adjacent vars are still enforced.
    expect(env.AWS_REGION).toBe('us-east-1')
    expect(env.S3_BUCKET).toBe('test-bucket')
    expect(env.CDN_BASE_URL).toBe('https://cdn.example.test')
  })

  it('loads with AWS keys provided (local dev path)', () => {
    applyEnv({
      ...baseEnv(),
      AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE',
      AWS_SECRET_ACCESS_KEY: 'secret-value',
    })
    const env = loadEnv()
    expect(env.AWS_ACCESS_KEY_ID).toBe('AKIAEXAMPLE')
    expect(env.AWS_SECRET_ACCESS_KEY).toBe('secret-value')
  })

  it("rejects the placeholder '-' for a (non-empty) AWS key", () => {
    applyEnv({ ...baseEnv(), AWS_ACCESS_KEY_ID: '-' })
    expect(() => loadEnv()).toThrow(/AWS_ACCESS_KEY_ID/)
  })

  it('treats an empty AWS key as not provided (blank .env template boots)', () => {
    applyEnv({ ...baseEnv(), AWS_SECRET_ACCESS_KEY: '' })
    const env = loadEnv()
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined()
  })

  it('still requires AWS_REGION, S3_BUCKET, CDN_BASE_URL', () => {
    const env = baseEnv()
    delete env.AWS_REGION
    applyEnv(env)
    expect(() => loadEnv()).toThrow(/AWS_REGION/)
  })
})

describe('env — Telegram channel config (optional)', () => {
  it('boots without a token: TELEGRAM_BOT_TOKEN undefined, channel defaults to @GWJOfficial', () => {
    applyEnv(baseEnv())
    const env = loadEnv()
    expect(env.TELEGRAM_BOT_TOKEN).toBeUndefined()
    expect(env.TELEGRAM_CHANNEL).toBe('@GWJOfficial')
  })

  it('uses a provided token and channel override', () => {
    applyEnv({ ...baseEnv(), TELEGRAM_BOT_TOKEN: 'BOT123', TELEGRAM_CHANNEL: '@GWJTest' })
    const env = loadEnv()
    expect(env.TELEGRAM_BOT_TOKEN).toBe('BOT123')
    expect(env.TELEGRAM_CHANNEL).toBe('@GWJTest')
  })

  it("rejects the placeholder '-' for a non-empty TELEGRAM_BOT_TOKEN", () => {
    applyEnv({ ...baseEnv(), TELEGRAM_BOT_TOKEN: '-' })
    expect(() => loadEnv()).toThrow(/TELEGRAM_BOT_TOKEN/)
  })
})

describe('env — PostgreSQL connection string', () => {
  it('requires DATABASE_URL', () => {
    const { DATABASE_URL: _omitted, ...rest } = baseEnv()
    applyEnv(rest)
    expect(() => loadEnv()).toThrow(/DATABASE_URL/)
  })

  it("rejects the placeholder '-' and a non-postgres URL (e.g. a leftover mongodb:// value)", () => {
    applyEnv({ ...baseEnv(), DATABASE_URL: '-' })
    expect(() => loadEnv()).toThrow(/DATABASE_URL/)
    applyEnv({ ...baseEnv(), DATABASE_URL: 'mongodb://10.20.1.92:27017/gwj' })
    expect(() => loadEnv()).toThrow(/DATABASE_URL must be a postgres/)
  })

  it('boots while the task definition still carries MONGO_URI (cutover transition) and ignores it', () => {
    applyEnv({ ...baseEnv(), MONGO_URI: 'mongodb://10.20.1.92:27017/gwj' })
    const env = loadEnv()
    expect(env.DATABASE_URL).toBe('postgres://gwj:gwj@localhost:5432/gwj_test')
    expect(Object.keys(env)).not.toContain('MONGO_URI')
  })
})

describe('env — CORS allowlist and proxy hops', () => {
  it('rejects an empty CORS_ORIGINS in production', () => {
    applyEnv({ ...baseEnv(), NODE_ENV: 'production', CORS_ORIGINS: ' , ' })
    expect(() => loadEnv()).toThrow(/CORS_ORIGINS must list at least one origin in production/)
  })

  it('allows an empty CORS_ORIGINS outside production', () => {
    applyEnv({ ...baseEnv(), CORS_ORIGINS: '' })
    expect(loadEnv().CORS_ORIGINS).toBe('')
  })

  it('trusts one proxy hop (the ALB) by default and accepts an override', () => {
    applyEnv(baseEnv())
    expect(loadEnv().TRUST_PROXY_HOPS).toBe(1)
    applyEnv({ ...baseEnv(), TRUST_PROXY_HOPS: '2' })
    expect(loadEnv().TRUST_PROXY_HOPS).toBe(2)
  })
})
