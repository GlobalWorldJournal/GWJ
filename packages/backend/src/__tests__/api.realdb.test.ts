import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import request from 'supertest';
import type { Express } from 'express';
import { CATEGORIES } from '@gwj/shared-types';
import { loadEnv, resetEnvCache, type Env } from '../env';
import { createApp } from '../app';
import { getDb } from '../db/client';
import { newRecordId } from '../db/ids';
import { users } from '../db/schema/users';
import { useTestDatabase, type TestDatabase } from '../test/postgres';
import { createFakeOxyFiles, FAKE_CLOUD_URL } from '../test/fakeOxyFiles';
import { hashPassword } from '../services/password';
import { tooSmallPngBuffer, truncatedPngBuffer, validPngBuffer } from './imageFixtures';

let testDb: TestDatabase;
let app: Express;

const ADMIN_USERNAME = 'nate';
const ADMIN_PASSWORD = 'super-secret-pw';

const oxyFiles = createFakeOxyFiles();
// The one remote image the import tests copy.
oxyFiles.remote.set('https://images.example.com/news/rig.png', {
  bytes: validPngBuffer(),
  mime: 'image/png',
});

function setTestEnv(): Env {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '4000';
  process.env.DATABASE_URL = testDb.url;
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.ADMIN_USERNAME = ADMIN_USERNAME;
  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  process.env.AWS_REGION = 'us-east-1';
  // AWS static keys are optional (ECS uses the task role); omit them here so the
  // app boots without them. Storage itself is exercised via a fake Oxy Files.
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;
  process.env.S3_BUCKET = 'test-bucket';
  process.env.CDN_BASE_URL = 'https://cdn.example.test';
  process.env.CORS_ORIGINS = 'https://globalworldjournal.com';
  resetEnvCache();
  return loadEnv();
}

const validArticle = () => ({
  title: 'Breaking: Markets Rally',
  deck: 'Stocks surge on optimism',
  kicker: 'MARKETS',
  category: CATEGORIES[2],
  author: 'Nate',
  body: '# Markets Rally\n\nA strong session **today**.',
  tags: ['markets'],
});

beforeAll(async () => {
  testDb = await useTestDatabase();
  const env = setTestEnv();
  app = createApp(env, { oxyFiles });
});

beforeEach(async () => {
  await testDb.truncateAll();
  const passwordHash = await hashPassword(ADMIN_PASSWORD, 10);
  await getDb()
    .insert(users)
    .values({ id: newRecordId(), username: ADMIN_USERNAME, passwordHash, role: 'admin' });
});

afterAll(async () => {
  await testDb.drop();
});

async function loginToken(): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

describe('GWJ API', () => {
  it('GET /healthz returns ok', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, release: null });
  });

  it('GET /readyz confirms the database is reachable', async () => {
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, release: null });
  });

  it('tags every response with a request id, reusing a well-formed upstream one', async () => {
    const generated = await request(app).get('/api/categories');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const upstream = await request(app).get('/api/categories').set('x-request-id', 'alb-trace-123');
    expect(upstream.headers['x-request-id']).toBe('alb-trace-123');

    const hostile = await request(app)
      .get('/api/categories')
      .set('x-request-id', 'not ok {"level":"error"}');
    expect(hostile.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('login returns a token and the admin user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toEqual({ username: ADMIN_USERNAME, role: 'admin' });
  });

  it('login with wrong password returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: ADMIN_USERNAME, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('POST /api/admin/articles without a token returns 401', async () => {
    const res = await request(app).post('/api/admin/articles').send(validArticle());
    expect(res.status).toBe(401);
  });

  it('POST /api/admin/articles with an invalid body returns 400 with details', async () => {
    const token = await loginToken();
    const res = await request(app)
      .post('/api/admin/articles')
      .set('authorization', `Bearer ${token}`)
      .send({ title: '', category: 'Sports', author: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toBeDefined();
  });

  it('create -> publish -> GET /api/articles/:slug returns the article', async () => {
    const token = await loginToken();

    const created = await request(app)
      .post('/api/admin/articles')
      .set('authorization', `Bearer ${token}`)
      .send(validArticle());
    expect(created.status).toBe(201);
    const { id, slug } = created.body;

    const beforePublish = await request(app).get(`/api/articles/${slug}`);
    expect(beforePublish.status).toBe(404);

    const published = await request(app)
      .post(`/api/admin/articles/${id}/publish`)
      .set('authorization', `Bearer ${token}`);
    expect(published.status).toBe(200);
    expect(published.body.status).toBe('published');

    const fetched = await request(app).get(`/api/articles/${slug}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.slug).toBe(slug);
    expect(fetched.body.title).toBe(validArticle().title);
  });

  it('draft articles are excluded from GET /api/articles', async () => {
    const token = await loginToken();

    await request(app)
      .post('/api/admin/articles')
      .set('authorization', `Bearer ${token}`)
      .send({ ...validArticle(), title: 'A Draft Story' });

    const publishedReq = await request(app)
      .post('/api/admin/articles')
      .set('authorization', `Bearer ${token}`)
      .send({ ...validArticle(), title: 'A Published Story' });
    await request(app)
      .post(`/api/admin/articles/${publishedReq.body.id}/publish`)
      .set('authorization', `Bearer ${token}`);

    const publicList = await request(app).get('/api/articles');
    expect(publicList.status).toBe(200);
    expect(publicList.body.data).toHaveLength(1);
    expect(publicList.body.data[0].title).toBe('A Published Story');

    const adminList = await request(app)
      .get('/api/admin/articles')
      .set('authorization', `Bearer ${token}`);
    expect(adminList.body.data).toHaveLength(2);
  });

  it('public listing and search never return drafts, even when ?status=draft is asked for', async () => {
    const token = await loginToken();
    await request(app)
      .post('/api/admin/articles')
      .set('authorization', `Bearer ${token}`)
      .send({ ...validArticle(), title: 'Secret merger draft' });

    const list = await request(app).get('/api/articles?status=draft');
    expect(list.status).toBe(200);
    expect(list.body.data).toEqual([]);
    expect(list.body.pagination.total).toBe(0);

    const search = await request(app).get('/api/search?q=merger&status=draft');
    expect(search.status).toBe(200);
    expect(search.body.data).toEqual([]);

    // The admin path still honours an explicit status.
    const admin = await request(app)
      .get('/api/admin/articles?status=draft')
      .set('authorization', `Bearer ${token}`);
    expect(admin.body.data.map((a: { title: string }) => a.title)).toEqual(['Secret merger draft']);
  });

  it('public responses omit the internal source provenance; admin responses keep it', async () => {
    const token = await loginToken();
    const source = { name: 'Wire', articleUrl: 'https://example.com/original' };
    const created = await request(app)
      .post('/api/admin/articles')
      .set('authorization', `Bearer ${token}`)
      .send({ ...validArticle(), title: 'Provenance story', status: 'published', source });
    expect(created.status).toBe(201);
    expect(created.body.source).toEqual(source);

    const list = await request(app).get('/api/articles');
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).not.toHaveProperty('source');

    const single = await request(app).get(`/api/articles/${created.body.slug}`);
    expect(single.status).toBe(200);
    expect(single.body).not.toHaveProperty('source');

    const search = await request(app).get('/api/search?q=provenance');
    expect(search.body.data).toHaveLength(1);
    expect(search.body.data[0]).not.toHaveProperty('source');

    const admin = await request(app)
      .get(`/api/admin/articles/${created.body.id}`)
      .set('authorization', `Bearer ${token}`);
    expect(admin.body.source).toEqual(source);
  });

  it('?featured=false does not filter to featured stories only', async () => {
    const token = await loginToken();
    for (const [title, featured] of [
      ['Lead story', 5],
      ['Ordinary story', 0],
    ] as const) {
      await request(app)
        .post('/api/admin/articles')
        .set('authorization', `Bearer ${token}`)
        .send({ ...validArticle(), title, featured, status: 'published' });
    }
    const all = await request(app).get('/api/articles?featured=false');
    expect(all.body.data).toHaveLength(2);
    const featuredOnly = await request(app).get('/api/articles?featured=true');
    expect(featuredOnly.body.data.map((a: { title: string }) => a.title)).toEqual(['Lead story']);
  });

  it('rate limits key on the client address behind the load balancer, not the proxy', async () => {
    // Two clients behind the same proxy hop get independent login buckets: the
    // remaining-count header for client B is untouched by client A's attempts.
    const attempt = (ip: string) =>
      request(app)
        .post('/api/auth/login')
        .set('x-forwarded-for', ip)
        .send({ username: ADMIN_USERNAME, password: 'wrong-password' });
    const firstA = await attempt('198.51.100.1');
    await attempt('198.51.100.1');
    const firstB = await attempt('198.51.100.2');
    expect(firstB.headers['ratelimit-remaining']).toBe(firstA.headers['ratelimit-remaining']);
  });

  it('the login limiter counts failed attempts only', async () => {
    const ip = '203.0.113.9';
    const login = (password: string) =>
      request(app)
        .post('/api/auth/login')
        .set('x-forwarded-for', ip)
        .send({ username: ADMIN_USERNAME, password });
    const firstFailure = await login('wrong-password');
    const remaining = Number(firstFailure.headers['ratelimit-remaining']);
    await login(ADMIN_PASSWORD).expect(200);
    await login(ADMIN_PASSWORD).expect(200);
    const nextFailure = await login('wrong-password');
    expect(Number(nextFailure.headers['ratelimit-remaining'])).toBe(remaining - 1);
  });

  it('refuses an off-allowlist browser origin without a server error', async () => {
    const res = await request(app).get('/api/categories').set('origin', 'https://evil.example');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();

    const allowed = await request(app)
      .get('/api/categories')
      .set('origin', 'https://globalworldjournal.com');
    expect(allowed.headers['access-control-allow-origin']).toBe('https://globalworldjournal.com');
  });

  it('lets the reader site, on another origin, receive responses to no-cors requests', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it("an old slug 301-redirects to the article's current slug", async () => {
    const token = await loginToken();
    const created = await request(app)
      .post('/api/admin/articles')
      .set('authorization', `Bearer ${token}`)
      .send({ ...validArticle(), title: 'Original headline', status: 'published' });
    await request(app)
      .patch(`/api/admin/articles/${created.body.id}`)
      .set('authorization', `Bearer ${token}`)
      .send({ slug: 'new-url' })
      .expect(200);

    const old = await request(app).get('/api/articles/original-headline');
    expect(old.status).toBe(301);
    expect(old.headers.location).toBe('/api/articles/new-url');

    const missing = await request(app).get('/api/articles/never-existed');
    expect(missing.status).toBe(404);
  });

  it('a public article lists its published editions in other languages', async () => {
    const token = await loginToken();
    const en = await request(app)
      .post('/api/admin/articles')
      .set('authorization', `Bearer ${token}`)
      .send({ ...validArticle(), title: 'Markets rally worldwide', status: 'published' });
    const es = await request(app)
      .post('/api/admin/articles')
      .set('authorization', `Bearer ${token}`)
      .send({
        ...validArticle(),
        title: 'Los mercados suben en todo el mundo',
        language: 'es',
        translationOf: en.body.id,
        status: 'published',
      });
    expect(es.status).toBe(201);

    const res = await request(app).get(`/api/articles/${en.body.slug}`);
    expect(res.body.translations).toEqual([
      { id: es.body.id, language: 'es', slug: es.body.slug, status: 'published' },
    ]);

    const clash = await request(app)
      .post('/api/admin/articles')
      .set('authorization', `Bearer ${token}`)
      .send({ ...validArticle(), title: 'Otra', language: 'es', translationOf: en.body.id });
    expect(clash.status).toBe(409);
    expect(clash.body.error).toMatch(/already has an edition in es/);
  });

  it('records the logged-in admin as the author of each change, and restores over HTTP', async () => {
    const token = await loginToken();
    const auth = { authorization: `Bearer ${token}` };
    const created = await request(app)
      .post('/api/admin/articles')
      .set(auth)
      .send({ ...validArticle(), title: 'Versioned story' });
    await request(app)
      .patch(`/api/admin/articles/${created.body.id}`)
      .set(auth)
      .send({ title: 'Versioned story, edited' })
      .expect(200);

    const history = await request(app)
      .get(`/api/admin/articles/${created.body.id}/revisions`)
      .set(auth);
    expect(history.status).toBe(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0]).toMatchObject({ actor: ADMIN_USERNAME, title: 'Versioned story' });

    const restored = await request(app)
      .post(`/api/admin/articles/${created.body.id}/revisions/${history.body[0].id}/restore`)
      .set(auth);
    expect(restored.status).toBe(200);
    expect(restored.body.title).toBe('Versioned story');

    const bogus = await request(app)
      .get(`/api/admin/articles/${created.body.id}/revisions/not-a-number`)
      .set(auth);
    expect(bogus.status).toBe(404);
    const anonymous = await request(app).get(`/api/admin/articles/${created.body.id}/revisions`);
    expect(anonymous.status).toBe(401);
  });

  it('public reads are briefly cacheable; admin responses never are', async () => {
    const list = await request(app).get('/api/articles');
    expect(list.headers['cache-control']).toBe('public, max-age=60, stale-while-revalidate=300');
    const missing = await request(app).get('/api/articles/no-such-story');
    expect(missing.status).toBe(404);
    expect(missing.headers['cache-control']).toBe('public, max-age=60, stale-while-revalidate=300');

    const admin = await request(app)
      .get('/api/admin/articles')
      .set('authorization', `Bearer ${await loginToken()}`);
    expect(admin.headers['cache-control']).toBe('no-store');
    const anonymous = await request(app).get('/api/admin/articles');
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers['cache-control']).toBe('no-store');
  });

  it('POST /articles/:id/corrections appends a public correction (admin only, non-empty)', async () => {
    const token = await loginToken();
    const created = await request(app)
      .post('/api/admin/articles')
      .set('authorization', `Bearer ${token}`)
      .send({ ...validArticle(), title: 'Corrected story', status: 'published' });
    const path = `/api/admin/articles/${created.body.id}/corrections`;

    expect((await request(app).post(path).send({ text: 'Fixed.' })).status).toBe(401);
    const empty = await request(app)
      .post(path)
      .set('authorization', `Bearer ${token}`)
      .send({ text: ' ' });
    expect(empty.status).toBe(400);

    const ok = await request(app)
      .post(path)
      .set('authorization', `Bearer ${token}`)
      .send({ text: 'An earlier version misstated the figure.' });
    expect(ok.status).toBe(200);
    const readerView = await request(app).get(`/api/articles/${created.body.slug}`);
    expect(readerView.body.corrections).toEqual([
      { at: expect.any(String), text: 'An earlier version misstated the figure.' },
    ]);
  });

  describe('agent API tokens', () => {
    async function mintToken(scopes: string[], name = 'newsroom-agent') {
      const res = await request(app)
        .post('/api/admin/tokens')
        .set('authorization', `Bearer ${await loginToken()}`)
        .send({ name, scopes });
      expect(res.status).toBe(201);
      expect(res.body.token).toMatch(/^gwj_/);
      return res.body as { id: string; token: string };
    }

    it('an agent acts within its scopes and is recorded as agent:<name>', async () => {
      const { token } = await mintToken(['articles:write', 'articles:publish', 'media:upload']);
      const agent = { authorization: `Bearer ${token}` };

      const created = await request(app)
        .post('/api/admin/articles')
        .set(agent)
        .send({ ...validArticle(), title: 'Filed by the agent', status: 'published' });
      expect(created.status).toBe(201);
      await request(app)
        .patch(`/api/admin/articles/${created.body.id}`)
        .set(agent)
        .send({ deck: 'Tightened deck' })
        .expect(200);
      const history = await request(app)
        .get(`/api/admin/articles/${created.body.id}/revisions`)
        .set(agent);
      expect(history.body[0].actor).toBe('agent:newsroom-agent');

      // Not granted: deleting, takedowns, and managing tokens (people only).
      expect(
        (await request(app).delete(`/api/admin/articles/${created.body.id}`).set(agent)).status,
      ).toBe(403);
      expect((await request(app).get('/api/admin/takedown-requests').set(agent)).status).toBe(403);
      expect((await request(app).get('/api/admin/tokens').set(agent)).status).toBe(403);
    });

    it('publishing needs the publish scope, also when creating straight to published', async () => {
      const { token } = await mintToken(['articles:write'], 'drafts-only');
      const agent = { authorization: `Bearer ${token}` };
      const live = await request(app)
        .post('/api/admin/articles')
        .set(agent)
        .send({ ...validArticle(), status: 'published' });
      expect(live.status).toBe(403);
      const draft = await request(app).post('/api/admin/articles').set(agent).send(validArticle());
      expect(draft.status).toBe(201);
      const publish = await request(app)
        .post(`/api/admin/articles/${draft.body.id}/publish`)
        .set(agent);
      expect(publish.status).toBe(403);
    });

    it('a revoked or unknown token is refused; tokens are listed without their secret', async () => {
      const { id, token } = await mintToken(['articles:write']);
      const admin = { authorization: `Bearer ${await loginToken()}` };
      const listed = await request(app).get('/api/admin/tokens').set(admin);
      expect(listed.body).toEqual([
        expect.objectContaining({ id, name: 'newsroom-agent', revokedAt: null }),
      ]);
      expect(JSON.stringify(listed.body)).not.toContain(token);

      await request(app).post(`/api/admin/tokens/${id}/revoke`).set(admin).expect(200);
      const refused = await request(app)
        .get('/api/admin/articles')
        .set('authorization', `Bearer ${token}`);
      expect(refused.status).toBe(401);
      const forged = await request(app)
        .get('/api/admin/articles')
        .set('authorization', 'Bearer gwj_forged');
      expect(forged.status).toBe(401);
    });
  });

  it('login fails the same way for an unknown user as for a wrong password', async () => {
    const unknown = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.77')
      .send({ username: 'nobody', password: 'whatever' });
    const wrong = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.78')
      .send({ username: ADMIN_USERNAME, password: 'whatever' });
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it('GET /api/categories returns the 7 fixed categories', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(CATEGORIES.length);
    expect(res.body.map((c: { name: string }) => c.name)).toEqual([...CATEGORIES]);
  });

  it('admin can fetch a DRAFT by id and by slug; public route still hides it', async () => {
    const token = await loginToken();

    const created = await request(app)
      .post('/api/admin/articles')
      .set('authorization', `Bearer ${token}`)
      .send({ ...validArticle(), title: 'A Hidden Draft' });
    expect(created.status).toBe(201);
    const { id, slug } = created.body;
    expect(created.body.status).toBe('draft');

    const byId = await request(app)
      .get(`/api/admin/articles/${id}`)
      .set('authorization', `Bearer ${token}`);
    expect(byId.status).toBe(200);
    expect(byId.body.id).toBe(id);
    expect(byId.body.status).toBe('draft');

    const bySlug = await request(app)
      .get(`/api/admin/articles/by-slug/${slug}`)
      .set('authorization', `Bearer ${token}`);
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.slug).toBe(slug);
    expect(bySlug.body.status).toBe('draft');

    // The public route remains published-only.
    const publicGet = await request(app).get(`/api/articles/${slug}`);
    expect(publicGet.status).toBe(404);
  });

  it('admin single-get returns 404 for a missing id/slug', async () => {
    const token = await loginToken();

    const missingId = await request(app)
      .get('/api/admin/articles/64b7f0f0f0f0f0f0f0f0f0f0')
      .set('authorization', `Bearer ${token}`);
    expect(missingId.status).toBe(404);

    const missingSlug = await request(app)
      .get('/api/admin/articles/by-slug/does-not-exist')
      .set('authorization', `Bearer ${token}`);
    expect(missingSlug.status).toBe(404);
  });

  it('admin single-get requires a token (401 without one)', async () => {
    const created = await request(app)
      .post('/api/admin/articles')
      .set('authorization', `Bearer ${await loginToken()}`)
      .send({ ...validArticle(), title: 'Token Guard Check' });
    const { id, slug } = created.body;

    const byId = await request(app).get(`/api/admin/articles/${id}`);
    expect(byId.status).toBe(401);

    const bySlug = await request(app).get(`/api/admin/articles/by-slug/${slug}`);
    expect(bySlug.status).toBe(401);
  });

  describe('POST /api/admin/upload (image validation)', () => {
    it('accepts a complete, large-enough image and returns 201 with a url', async () => {
      const token = await loginToken();
      const res = await request(app)
        .post('/api/admin/upload')
        .set('authorization', `Bearer ${token}`)
        .attach('file', validPngBuffer(800, 700), {
          filename: 'hero.png',
          contentType: 'image/png',
        });
      expect(res.status).toBe(201);
      expect(typeof res.body.url).toBe('string');
      expect(oxyFiles.fileIdOf(res.body.url)).not.toBeNull();
      expect(res.body.url.startsWith(`${FAKE_CLOUD_URL}/`)).toBe(true);
      // Re-encoded to WebP, with Oxy's renditions narrower than the image for srcset.
      expect(res.body.width).toBe(800);
      expect(res.body.variants.map((variant: { width: number }) => variant.width)).toEqual([
        320, 640,
      ]);
    });

    it('rejects a truncated/corrupt image with 422 and an actionable reason', async () => {
      const token = await loginToken();
      const res = await request(app)
        .post('/api/admin/upload')
        .set('authorization', `Bearer ${token}`)
        .attach('file', truncatedPngBuffer(800, 700), {
          filename: 'broken.png',
          contentType: 'image/png',
        });
      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/Rejected image upload/i);
      expect(res.body.details).toMatchObject({ reason: 'truncated' });
    });

    it('rejects a non-image (HTML) payload with 422', async () => {
      const token = await loginToken();
      const res = await request(app)
        .post('/api/admin/upload')
        .set('authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('<!doctype html><html></html>'), {
          filename: 'page.png',
          contentType: 'image/png',
        });
      expect(res.status).toBe(422);
      expect(res.body.details).toMatchObject({ reason: 'unknown-format' });
    });

    it('rejects an image below the minimum dimension with 422', async () => {
      const token = await loginToken();
      const res = await request(app)
        .post('/api/admin/upload')
        .set('authorization', `Bearer ${token}`)
        .attach('file', tooSmallPngBuffer(), { filename: 'tiny.png', contentType: 'image/png' });
      expect(res.status).toBe(422);
      expect(res.body.details).toMatchObject({ reason: 'too-small' });
    });

    it('POST /upload/from-url has Oxy import a remote image, then processes it like an upload', async () => {
      const token = await loginToken();
      const res = await request(app)
        .post('/api/admin/upload/from-url')
        .set('authorization', `Bearer ${token}`)
        .send({ url: 'https://images.example.com/news/rig.png' });
      expect(res.status).toBe(201);
      const fileId = oxyFiles.fileIdOf(res.body.url);
      expect(fileId).not.toBeNull();
      // The served file is the processed WebP, not the raw import.
      expect(oxyFiles.files.get(fileId ?? '')?.mime).toBe('image/webp');

      // Importing the same URL again downloads nothing and answers the same image.
      const downloads = oxyFiles.downloads;
      const again = await request(app)
        .post('/api/admin/upload/from-url')
        .set('authorization', `Bearer ${token}`)
        .send({ url: 'https://images.example.com/news/rig.png' });
      expect(again.status).toBe(201);
      expect(again.body.url).toBe(res.body.url);
      expect(oxyFiles.downloads).toBe(downloads);
    });

    it('POST /upload/from-url: a source Oxy cannot fetch is a 422 the agent can act on', async () => {
      const res = await request(app)
        .post('/api/admin/upload/from-url')
        .set('authorization', `Bearer ${await loginToken()}`)
        .send({ url: 'https://images.example.com/missing.png' });
      expect(res.status).toBe(422);
      expect(res.body.details).toMatchObject({ reason: 'fetch-failed' });
    });

    it('POST /upload/from-url requires a token and a valid url', async () => {
      const anonymous = await request(app)
        .post('/api/admin/upload/from-url')
        .send({ url: 'https://images.example.com/rig.png' });
      expect(anonymous.status).toBe(401);

      const invalid = await request(app)
        .post('/api/admin/upload/from-url')
        .set('authorization', `Bearer ${await loginToken()}`)
        .send({ url: 'not a url' });
      expect(invalid.status).toBe(400);
    });

    it('rejects an upload with no file (400)', async () => {
      const token = await loginToken();
      const res = await request(app)
        .post('/api/admin/upload')
        .set('authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
    });
  });
});

describe('Most Popular API', () => {
  async function publish(title: string): Promise<{ id: string; slug: string }> {
    const token = await loginToken();
    const res = await request(app)
      .post('/api/admin/articles')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validArticle(), title, status: 'published' });
    expect(res.status).toBe(201);
    return res.body;
  }

  it('counts beacon views and ranks the edition by them (no internal fields)', async () => {
    const first = await publish('First Story');
    const second = await publish('Second Story');
    for (const id of [second.id, second.id, first.id]) {
      const res = await request(app).post(`/api/articles/${id}/view`);
      expect(res.status).toBe(204);
    }

    const res = await request(app).get('/api/articles/popular?language=en&days=1&limit=5');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('public');
    expect(res.body.data.map((a: { title: string }) => a.title)).toEqual([
      'Second Story',
      'First Story',
    ]);
    expect(res.body.data[0]).not.toHaveProperty('source');
  });

  it('"popular" is not taken for an article slug, and bad windows are refused', async () => {
    expect((await request(app).get('/api/articles/popular')).status).toBe(200);
    expect((await request(app).get('/api/articles/popular?days=0')).status).toBe(400);
    expect((await request(app).get('/api/articles/popular?limit=500')).status).toBe(400);
  });

  it('a view of something that is not a published article is accepted and ignored', async () => {
    expect((await request(app).post('/api/articles/nope/view')).status).toBe(204);
    const res = await request(app).get('/api/articles/popular');
    expect(res.body.data).toEqual([]);
  });
});

describe('Newsroom users and roles', () => {
  const EDITOR = { username: 'ana.editor', password: 'a-long-editor-pass', role: 'editor' };

  async function login(username: string, password: string): Promise<request.Response> {
    return request(app).post('/api/auth/login').send({ username, password });
  }

  async function createEditor(adminToken: string): Promise<{ id: string; token: string }> {
    const created = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(EDITOR);
    expect(created.status).toBe(201);
    const session = await login(EDITOR.username, EDITOR.password);
    expect(session.body.user).toEqual({ username: EDITOR.username, role: 'editor' });
    return { id: created.body.id, token: session.body.token };
  }

  it('an editor writes and publishes, but cannot delete or run the newsroom', async () => {
    const admin = await loginToken();
    const editor = await createEditor(admin);
    const auth = { Authorization: `Bearer ${editor.token}` };

    const article = await request(app)
      .post('/api/admin/articles')
      .set(auth)
      .send({ ...validArticle(), status: 'published' });
    expect(article.status).toBe(201);
    expect(
      (await request(app).delete(`/api/admin/articles/${article.body.id}`).set(auth)).status,
    ).toBe(403);
    expect((await request(app).get('/api/admin/tokens').set(auth)).status).toBe(403);
    expect((await request(app).get('/api/admin/users').set(auth)).status).toBe(403);
    // Advertising and the Mention grant are the business side, not the newsroom's.
    expect((await request(app).get('/api/admin/ad-campaigns').set(auth)).status).toBe(403);
    expect((await request(app).get('/api/admin/mention/connect').set(auth)).status).toBe(403);
    expect((await request(app).get('/api/admin/takedown-requests').set(auth)).status).toBe(200);
  });

  it('deactivating an account cuts off its current session at once, and its sign-in', async () => {
    const admin = await loginToken();
    const editor = await createEditor(admin);
    const off = await request(app)
      .patch(`/api/admin/users/${editor.id}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ disabled: true });
    expect(off.status).toBe(200);
    expect(off.body.disabledAt).not.toBeNull();

    const stale = await request(app)
      .get('/api/admin/articles')
      .set('Authorization', `Bearer ${editor.token}`);
    expect(stale.status).toBe(401);
    expect((await login(EDITOR.username, EDITOR.password)).status).toBe(401);
  });

  it('the newsroom always keeps an active admin; nobody removes their own admin access', async () => {
    const admin = await loginToken();
    const auth = { Authorization: `Bearer ${admin}` };
    const users = await request(app).get('/api/admin/users').set(auth);
    const self = users.body.find((u: { username: string }) => u.username === ADMIN_USERNAME);

    const demoteSelf = await request(app)
      .patch(`/api/admin/users/${self.id}`)
      .set(auth)
      .send({ role: 'editor' });
    expect(demoteSelf.status).toBe(400);

    const editor = await createEditor(admin);
    const promoted = await request(app)
      .patch(`/api/admin/users/${editor.id}`)
      .set(auth)
      .send({ role: 'admin' });
    expect(promoted.body.role).toBe('admin');
    // With a second admin, the first may now be demoted (by the other).
    const second = (await login(EDITOR.username, EDITOR.password)).body.token;
    const demoted = await request(app)
      .patch(`/api/admin/users/${self.id}`)
      .set('Authorization', `Bearer ${second}`)
      .send({ role: 'editor' });
    expect(demoted.status).toBe(200);
  });

  it('usernames are unique and passwords long', async () => {
    const admin = await loginToken();
    const auth = { Authorization: `Bearer ${admin}` };
    await createEditor(admin);
    expect((await request(app).post('/api/admin/users').set(auth).send(EDITOR)).status).toBe(409);
    const short = await request(app)
      .post('/api/admin/users')
      .set(auth)
      .send({ ...EDITOR, username: 'other', password: 'short' });
    expect(short.status).toBe(400);
  });

  it('a person changes their own password; a wrong current password keeps the session', async () => {
    const admin = await loginToken();
    const auth = { Authorization: `Bearer ${admin}` };
    const wrong = await request(app)
      .post('/api/admin/account/password')
      .set(auth)
      .send({ currentPassword: 'not-it', newPassword: 'a-brand-new-password' });
    expect(wrong.status).toBe(400);

    const changed = await request(app)
      .post('/api/admin/account/password')
      .set(auth)
      .send({ currentPassword: ADMIN_PASSWORD, newPassword: 'a-brand-new-password' });
    expect(changed.status).toBe(204);
    expect((await login(ADMIN_USERNAME, ADMIN_PASSWORD)).status).toBe(401);
    expect((await login(ADMIN_USERNAME, 'a-brand-new-password')).status).toBe(200);
  });
});
