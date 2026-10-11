import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { loadEnv, resetEnvCache, type Env } from '../../env';
import { getDb } from '../../db/client';
import { useTestDatabase, type TestDatabase } from '../../test/postgres';
import { mentionOauth } from '../../db/schema/mentionOauth';
import { seal } from '../../services/secretSeal';
import { accessToken, type ClaimTiming } from '../mentionOauthService';

const DOMAIN = 'globalworldjournal.com';
const SEAL_KEY = Buffer.alloc(32, 7).toString('base64');

let testDb: TestDatabase;
let env: Env;

function makeEnv(): Env {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '4000';
  process.env.DATABASE_URL = testDb.url;
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.ADMIN_USERNAME = 'nate';
  process.env.ADMIN_PASSWORD = 'super-secret-pw';
  process.env.AWS_REGION = 'us-east-1';
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;
  process.env.S3_BUCKET = 'test-bucket';
  process.env.CDN_BASE_URL = 'https://cdn.example.test';
  process.env.CORS_ORIGINS = '';
  process.env.FEDIVERSE_DOMAIN = DOMAIN;
  process.env.MENTION_OAUTH_SEAL_KEY = SEAL_KEY;
  process.env.MENTION_REDIRECT_BASE_URL = 'https://api.globalworldjournal.com';
  resetEnvCache();
  return loadEnv();
}

/** Attempts/wait well past staleMs, so a reclaim-after-crash is never a coin flip against scheduling jitter under a loaded test run. */
const TINY: ClaimTiming = {
  staleMs: 60,
  attempts: 6,
  waitMs: 30,
  backoffBaseMs: 30,
  backoffCapMs: 300,
};

let originalFetch: typeof fetch;
let calls: Array<{ refreshToken: string }> = [];
/** What the next (and each subsequent) mocked refresh call hands back. */
let nextTokens: Array<{ access_token: string; refresh_token: string; expires_in: number }> = [];
/** Set to make the next call fail with this HTTP status instead of succeeding; cleared after use. */
let failNextWith: number | null = null;

async function seedRow(overrides: {
  accessToken: string;
  accessExpiresAt: number;
  refreshToken: string;
}): Promise<void> {
  await getDb()
    .insert(mentionOauth)
    .values({
      resource: 'mention',
      clientId: 'client-1',
      tokenEndpoint: 'https://auth.example/token',
      scopes: 'social.posts.publish',
      accessToken: await seal(env, overrides.accessToken),
      accessExpiresAt: overrides.accessExpiresAt,
      refreshToken: await seal(env, overrides.refreshToken),
    });
}

beforeAll(async () => {
  testDb = await useTestDatabase();
  env = makeEnv();
});

beforeEach(async () => {
  await testDb.truncateAll();
  calls = [];
  nextTokens = [];
  failNextWith = null;
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const body = new URLSearchParams(init?.body as string);
    calls.push({ refreshToken: body.get('refresh_token') ?? '' });
    if (failNextWith !== null) {
      const status = failNextWith;
      failNextWith = null;
      return new Response('<html>down for maintenance</html>', { status });
    }
    const next = nextTokens.shift() ?? {
      access_token: 'unexpected-call',
      refresh_token: 'unexpected-call',
      expires_in: 900,
    };
    return new Response(JSON.stringify(next), { status: 200 });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

afterAll(async () => {
  await testDb.drop();
});

describe('mentionOauthService.accessToken', () => {
  it("a token that isn't close to expiring is returned as-is, no refresh attempted", async () => {
    await seedRow({
      accessToken: 'still-good',
      accessExpiresAt: Date.now() + 600_000,
      refreshToken: 'r',
    });
    expect(await accessToken(env, TINY)).toBe('still-good');
    expect(calls).toHaveLength(0);
  });

  it('an expired token is refreshed once, claiming it in the database', async () => {
    await seedRow({
      accessToken: 'stale-access-token',
      accessExpiresAt: Date.now() - 1000,
      refreshToken: 'old-refresh-token',
    });
    nextTokens = [{ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 900 }];
    expect(await accessToken(env, TINY)).toBe('new-access');
    expect(calls).toEqual([{ refreshToken: 'old-refresh-token' }]);
  });

  it("a second concurrent caller never presents the single-use refresh token twice: it waits and reuses the winner's result", async () => {
    await seedRow({
      accessToken: 'stale',
      accessExpiresAt: Date.now() - 1000,
      refreshToken: 'old-refresh-token',
    });
    // The real hazard this guards against: GWJ runs several backend replicas
    // sharing this one row. Two near-simultaneous calls must never both
    // present "old-refresh-token" — only one may ever reach the network.
    nextTokens = [{ access_token: 'winner', refresh_token: 'winner-refresh', expires_in: 900 }];
    const [a, b] = await Promise.all([accessToken(env, TINY), accessToken(env, TINY)]);
    expect(a).toBe('winner');
    expect(b).toBe('winner');
    expect(calls).toEqual([{ refreshToken: 'old-refresh-token' }]);
  });

  it('a claim abandoned by a crashed holder is eventually reclaimed and refreshed independently', async () => {
    await seedRow({
      accessToken: 'stale',
      accessExpiresAt: Date.now() - 1000,
      refreshToken: 'old-refresh-token',
    });
    // Simulate a crashed process: claim the refresh directly in the DB, then
    // never follow up with a stored result — exactly what a dead replica
    // would leave behind.
    await getDb()
      .update(mentionOauth)
      .set({ refreshClaimedAt: Date.now() })
      .where(eq(mentionOauth.resource, 'mention'));

    nextTokens = [
      { access_token: 'recovered', refresh_token: 'recovered-refresh', expires_in: 900 },
    ];
    expect(await accessToken(env, TINY)).toBe('recovered');
    expect(calls).toEqual([{ refreshToken: 'old-refresh-token' }]);
  });

  it('giving up on a claim that never clears and never goes stale enough in time throws, rather than reusing the token', async () => {
    await seedRow({
      accessToken: 'stale',
      accessExpiresAt: Date.now() - 1000,
      refreshToken: 'old-refresh-token',
    });
    await getDb()
      .update(mentionOauth)
      .set({ refreshClaimedAt: Date.now() })
      .where(eq(mentionOauth.resource, 'mention'));

    await expect(
      accessToken(env, { ...TINY, staleMs: 60_000, attempts: 2, waitMs: 5 }),
    ).rejects.toThrow(/another process/);
    expect(calls).toHaveLength(0);
  });

  it('a failed refresh (the auth server itself erroring) is recorded, and backs off instead of retrying on the very next call', async () => {
    await seedRow({
      accessToken: 'stale',
      accessExpiresAt: Date.now() - 1000,
      refreshToken: 'old-refresh-token',
    });
    failNextWith = 503;
    await expect(accessToken(env, TINY)).rejects.toThrow(/503/);
    expect(calls).toHaveLength(1);

    // Immediately after, a second call doesn't even try the network — it backs off.
    await expect(accessToken(env, TINY)).rejects.toThrow(/backing off/);
    expect(calls).toHaveLength(1); // unchanged: no second network call was made
  });

  it('not authorized at all answers with a clear, actionable error', async () => {
    await expect(accessToken(env, TINY)).rejects.toThrow(/not authorized for Mention/);
  });
});
