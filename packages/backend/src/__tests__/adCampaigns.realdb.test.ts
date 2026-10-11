import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { Express } from 'express';
import { AD_CREATIVE_MIN_HEIGHT, AD_CREATIVE_MIN_WIDTH } from '@gwj/shared-types';
import { loadEnv, resetEnvCache, type Env } from '../env';
import { createApp } from '../app';
import { getDb } from '../db/client';
import { newRecordId } from '../db/ids';
import { constraintNameOf, pgErrorCode } from '../db/pgErrors';
import { adCampaigns } from '../db/schema/adCampaigns';
import { users } from '../db/schema/users';
import { adCampaignService } from '../services/adCampaignService';
import { useTestDatabase, type TestDatabase } from '../test/postgres';
import type { UploadImageOptions, UploadService } from '../services/uploadService';
import { validPngBuffer } from './imageFixtures';

let testDb: TestDatabase;
let app: Express;

const ADMIN_USERNAME = 'nate';
const ADMIN_PASSWORD = 'super-secret-pw';
const HOUR_MS = 60 * 60 * 1000;

const uploadCalls: { filename: string; options: UploadImageOptions | undefined }[] = [];
const fakeUploadService: UploadService = {
  async uploadImage(_buffer, filename, _contentType, options) {
    uploadCalls.push({ filename, options });
    return { url: `https://cdn.example.test/articles/${filename}` };
  },
  async storeImage(_buffer, filename, _contentType, keyPrefix) {
    return { url: `https://cdn.example.test/${keyPrefix}${filename}` };
  },
};

function setTestEnv(): Env {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '4000';
  process.env.DATABASE_URL = testDb.url;
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.ADMIN_USERNAME = ADMIN_USERNAME;
  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  process.env.AWS_REGION = 'us-east-1';
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;
  process.env.S3_BUCKET = 'test-bucket';
  process.env.CDN_BASE_URL = 'https://cdn.example.test';
  process.env.CORS_ORIGINS = 'https://globalworldjournal.com';
  resetEnvCache();
  return loadEnv();
}

function isoFromNow(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

const campaign = (overrides: Record<string, unknown> = {}) => ({
  advertiserName: 'Acme Coffee',
  advertiserEmail: 'ads@acme.example',
  imageUrl: 'https://cdn.example.test/articles/acme-728x90.webp',
  clickUrl: 'https://acme.example/?utm_source=gwj',
  variant: 'leaderboard',
  startsAt: isoFromNow(-HOUR_MS),
  endsAt: isoFromNow(HOUR_MS),
  ...overrides,
});

beforeAll(async () => {
  testDb = await useTestDatabase();
  app = createApp(setTestEnv(), { uploadService: fakeUploadService });
});

beforeEach(async () => {
  await testDb.truncateAll();
  uploadCalls.length = 0;
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await getDb()
    .insert(users)
    .values({ id: newRecordId(), username: ADMIN_USERNAME, passwordHash, role: 'admin' });
});

afterAll(async () => {
  await testDb.drop();
});

async function adminHeader(): Promise<{ authorization: string }> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
  expect(res.status).toBe(200);
  return { authorization: `Bearer ${res.body.token as string}` };
}

async function create(overrides: Record<string, unknown> = {}): Promise<{ id: string }> {
  const res = await request(app)
    .post('/api/admin/ad-campaigns')
    .set(await adminHeader())
    .send(campaign(overrides));
  expect(res.status).toBe(201);
  return res.body as { id: string };
}

async function activeFor(variant: string) {
  return request(app).get('/api/ad-campaigns/active').query({ variant });
}

describe('admin ad-campaign routes', () => {
  it('require an admin: 401 without a token, 403 for an agent token whatever its scopes', async () => {
    expect((await request(app).get('/api/admin/ad-campaigns')).status).toBe(401);
    const minted = await request(app)
      .post('/api/admin/tokens')
      .set(await adminHeader())
      .send({ name: 'all-scopes', scopes: ['articles:write', 'media:upload', 'takedowns'] });
    expect(minted.status).toBe(201);
    const agent = { authorization: `Bearer ${minted.body.token as string}` };
    expect((await request(app).get('/api/admin/ad-campaigns').set(agent)).status).toBe(403);
    expect(
      (await request(app).post('/api/admin/ad-campaigns').set(agent).send(campaign())).status,
    ).toBe(403);
  });

  it('create → get → list → patch → delete', async () => {
    const admin = await adminHeader();
    const created = await request(app).post('/api/admin/ad-campaigns').set(admin).send(campaign());
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      advertiserName: 'Acme Coffee',
      advertiserEmail: 'ads@acme.example',
      variant: 'leaderboard',
      status: 'active',
    });
    const id = created.body.id as string;

    const fetched = await request(app).get(`/api/admin/ad-campaigns/${id}`).set(admin);
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(id);

    const listed = await request(app).get('/api/admin/ad-campaigns').set(admin);
    expect(listed.body.pagination.total).toBe(1);
    expect(listed.body.data[0].id).toBe(id);

    const paused = await request(app)
      .patch(`/api/admin/ad-campaigns/${id}`)
      .set(admin)
      .send({ status: 'paused', advertiserName: 'Acme Coffee Co.' });
    expect(paused.status).toBe(200);
    expect(paused.body).toMatchObject({ status: 'paused', advertiserName: 'Acme Coffee Co.' });
    expect(paused.body.clickUrl).toBe(created.body.clickUrl);

    const pausedOnly = await request(app)
      .get('/api/admin/ad-campaigns')
      .query({ status: 'active' })
      .set(admin);
    expect(pausedOnly.body.data).toEqual([]);

    expect((await request(app).delete(`/api/admin/ad-campaigns/${id}`).set(admin)).status).toBe(
      204,
    );
    expect((await request(app).get(`/api/admin/ad-campaigns/${id}`).set(admin)).status).toBe(404);
    expect((await request(app).delete(`/api/admin/ad-campaigns/${id}`).set(admin)).status).toBe(
      404,
    );
  });

  it('rejects a non-http click-through, a bad variant and an inverted window', async () => {
    const admin = await adminHeader();
    for (const overrides of [
      { clickUrl: 'javascript:alert(1)' },
      { variant: 'skyscraper' },
      { advertiserEmail: 'not-an-email' },
      { startsAt: isoFromNow(HOUR_MS), endsAt: isoFromNow(-HOUR_MS) },
    ]) {
      const res = await request(app)
        .post('/api/admin/ad-campaigns')
        .set(admin)
        .send(campaign(overrides));
      expect(res.status).toBe(400);
    }
  });

  it('checks a one-sided window patch against the stored other side', async () => {
    const { id } = await create();
    const res = await request(app)
      .patch(`/api/admin/ad-campaigns/${id}`)
      .set(await adminHeader())
      .send({ endsAt: isoFromNow(-2 * HOUR_MS) });
    expect(res.status).toBe(400);
  });

  it('never reactivates a cancelled campaign', async () => {
    const { id } = await create();
    const admin = await adminHeader();
    await request(app)
      .patch(`/api/admin/ad-campaigns/${id}`)
      .set(admin)
      .send({ status: 'cancelled' })
      .expect(200);
    const res = await request(app)
      .patch(`/api/admin/ad-campaigns/${id}`)
      .set(admin)
      .send({ status: 'active' });
    expect(res.status).toBe(409);
  });

  it('the database refuses an inverted window even past the API', async () => {
    const now = new Date();
    let caught: unknown;
    try {
      await getDb().insert(adCampaigns).values({
        id: newRecordId(),
        advertiserName: 'x',
        advertiserEmail: 'x@example.com',
        imageUrl: 'https://cdn.example.test/x.webp',
        clickUrl: 'https://example.com',
        variant: 'mrec',
        startsAt: now,
        endsAt: now,
      });
    } catch (err) {
      caught = err;
    }
    expect(pgErrorCode(caught)).toBe('23514');
    expect(constraintNameOf(caught)).toBe('ad_campaigns_window_check');
  });

  it('uploads a banner-sized creative the article-image upload would refuse', async () => {
    const admin = await adminHeader();
    const banner = validPngBuffer(728, 90);
    const asArticleImage = await request(app)
      .post('/api/admin/upload')
      .set(admin)
      .attach('file', banner, { filename: 'banner.png', contentType: 'image/png' });
    expect(asArticleImage.status).toBe(422);

    const res = await request(app)
      .post('/api/admin/ad-campaigns/creative')
      .set(admin)
      .attach('file', banner, { filename: 'banner.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.url).toBe('https://cdn.example.test/articles/banner.png');
    expect(uploadCalls).toEqual([
      {
        filename: 'banner.png',
        options: { minWidth: AD_CREATIVE_MIN_WIDTH, minHeight: AD_CREATIVE_MIN_HEIGHT },
      },
    ]);

    const tooSmall = await request(app)
      .post('/api/admin/ad-campaigns/creative')
      .set(admin)
      .attach('file', validPngBuffer(120, 60), { filename: 'tiny.png', contentType: 'image/png' });
    expect(tooSmall.status).toBe(422);
  });

  it('checks the creative is the right SHAPE for the slot it names, not just big enough', async () => {
    const admin = await adminHeader();

    // A square logo is well above the size floor but the wrong shape for an
    // 8.09:1 leaderboard — it would letterbox badly, so it's rejected outright.
    const square = validPngBuffer(600, 600);
    const wrongShape = await request(app)
      .post('/api/admin/ad-campaigns/creative')
      .set(admin)
      .field('variant', 'leaderboard')
      .attach('file', square, { filename: 'square.png', contentType: 'image/png' });
    expect(wrongShape.status).toBe(422);
    expect(wrongShape.body.details).toMatchObject({ reason: 'wrong-aspect-ratio' });

    // The same image is fine for `inline`, which has no fixed shape.
    const forInline = await request(app)
      .post('/api/admin/ad-campaigns/creative')
      .set(admin)
      .field('variant', 'inline')
      .attach('file', square, { filename: 'square.png', contentType: 'image/png' });
    expect(forInline.status).toBe(201);

    // And a correctly-shaped banner is accepted for the slot it was made for.
    const rightShape = await request(app)
      .post('/api/admin/ad-campaigns/creative')
      .set(admin)
      .field('variant', 'leaderboard')
      .attach('file', validPngBuffer(728, 90), {
        filename: 'leaderboard.png',
        contentType: 'image/png',
      });
    expect(rightShape.status).toBe(201);
  });
});

describe('GET /api/ad-campaigns/active (public)', () => {
  it('returns null when nothing is booked, without auth, cached for a minute', async () => {
    const res = await activeFor('mrec');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ campaign: null });
    expect(res.headers['cache-control']).toBe('public, max-age=60');
  });

  it('serves a live campaign for its own variant only, never exposing the advertiser contact', async () => {
    const { id } = await create({ variant: 'mrec' });
    const res = await activeFor('mrec');
    expect(res.body).toEqual({
      campaign: {
        id,
        advertiserName: 'Acme Coffee',
        imageUrl: 'https://cdn.example.test/articles/acme-728x90.webp',
        clickUrl: 'https://acme.example/?utm_source=gwj',
        variant: 'mrec',
      },
    });
    expect(JSON.stringify(res.body)).not.toContain('ads@acme.example');
    expect((await activeFor('leaderboard')).body).toEqual({ campaign: null });
  });

  it('ignores paused, cancelled, not-yet-started and ended campaigns', async () => {
    await create({ status: 'paused' });
    await create({ status: 'cancelled' });
    await create({ startsAt: isoFromNow(HOUR_MS), endsAt: isoFromNow(2 * HOUR_MS) });
    await create({ startsAt: isoFromNow(-2 * HOUR_MS), endsAt: isoFromNow(-HOUR_MS) });
    expect((await activeFor('leaderboard')).body).toEqual({ campaign: null });
  });

  it('when bookings overlap, the most recently created one wins', async () => {
    await create({ advertiserName: 'First Booked' });
    const newest = await create({ advertiserName: 'Last Booked' });
    const res = await activeFor('leaderboard');
    expect(res.body.campaign).toMatchObject({ id: newest.id, advertiserName: 'Last Booked' });
  });

  it('treats the window as [startsAt, endsAt)', async () => {
    const { id } = await create();
    const row = await adCampaignService.getById(id);
    expect(await adCampaignService.findActive('leaderboard', new Date(row.startsAt))).toMatchObject(
      { id },
    );
    expect(await adCampaignService.findActive('leaderboard', new Date(row.endsAt))).toBeNull();
  });

  it('rejects an unknown variant', async () => {
    expect((await activeFor('skyscraper')).status).toBe(400);
  });
});
