import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadEnv, resetEnvCache } from '../env'

/** A complete, valid env WITHOUT the optional AWS static keys. */
function baseEnv(): Record<string, string> {
  return {
    NODE_ENV: 'test',
    PORT: '4000',
    MONGO_URI: 'mongodb://localhost:27017/gwj-test',
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
  'MONGO_URI',
  'JWT_SECRET',
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD',
  'AWS_REGION',
  'S3_BUCKET',
  'CDN_BASE_URL',
  'CORS_ORIGINS',
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
