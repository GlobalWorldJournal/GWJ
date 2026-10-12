import { describe, expect, it } from 'bun:test';
import { loadEnv, resetEnvCache, type Env } from '../../env';
import { open, seal } from '../secretSeal';

function makeEnv(sealKey?: string): Env {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '4000';
  process.env.DATABASE_URL = 'postgres://gwj:gwj@127.0.0.1:5432/postgres';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.ADMIN_USERNAME = 'nate';
  process.env.ADMIN_PASSWORD = 'super-secret-pw';
  process.env.AWS_REGION = 'us-east-1';
  process.env.S3_BUCKET = 'test-bucket';
  process.env.CDN_BASE_URL = 'https://cdn.example.test';
  process.env.CORS_ORIGINS = '';
  if (sealKey === undefined) delete process.env.MENTION_OAUTH_SEAL_KEY;
  else process.env.MENTION_OAUTH_SEAL_KEY = sealKey;
  resetEnvCache();
  return loadEnv();
}

describe('secretSeal', () => {
  it('seals and opens back to the original plaintext', async () => {
    const env = makeEnv(Buffer.alloc(32, 7).toString('base64'));
    const sealed = await seal(env, 'a refresh token nobody else should read');
    expect(sealed).not.toContain('a refresh token');
    expect(await open(env, sealed)).toBe('a refresh token nobody else should read');
  });

  it('two seals of the same plaintext differ (a fresh random IV each time)', async () => {
    const env = makeEnv(Buffer.alloc(32, 7).toString('base64'));
    expect(await seal(env, 'same value')).not.toBe(await seal(env, 'same value'));
  });

  it('opening with the wrong key fails rather than returning garbage silently', async () => {
    const envA = makeEnv(Buffer.alloc(32, 7).toString('base64'));
    const sealed = await seal(envA, 'secret');
    const envB = makeEnv(Buffer.alloc(32, 9).toString('base64'));
    await expect(open(envB, sealed)).rejects.toThrow();
  });

  it('a malformed sealed value is rejected, not silently misread', async () => {
    const env = makeEnv(Buffer.alloc(32, 7).toString('base64'));
    await expect(open(env, 'not-a-sealed-value')).rejects.toThrow(/malformed/);
  });

  it('refuses to seal anything without a configured key', async () => {
    const env = makeEnv(undefined);
    await expect(seal(env, 'x')).rejects.toThrow(/MENTION_OAUTH_SEAL_KEY/);
  });

  it('refuses a key that is not exactly 32 bytes', async () => {
    const env = makeEnv(Buffer.alloc(16, 1).toString('base64'));
    await expect(seal(env, 'x')).rejects.toThrow(/32 bytes/);
  });
});
