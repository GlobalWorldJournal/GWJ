import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { Express } from 'express';
import { CATEGORIES } from '@gwj/shared-types';
import { loadEnv, resetEnvCache, type Env } from '../env';
import { createApp } from '../app';
import { getDb } from '../db/client';
import { newRecordId } from '../db/ids';
import { users } from '../db/schema/users';
import { useTestDatabase, type TestDatabase } from '../test/postgres';
import { type UploadService } from '../services/uploadService';

let testDb: TestDatabase;
let app: Express;

const ADMIN_USERNAME = 'nate';
const ADMIN_PASSWORD = 'super-secret-pw';

const fakeUploadService: UploadService = {
  async uploadImage(_buffer, filename) {
    return { url: `https://cdn.example.test/articles/${filename}` };
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

const validArticle = () => ({
  title: 'Wire Photo Story',
  category: CATEGORIES[0],
  author: 'Nate',
  body: '# Wire Photo Story\n\nSomething happened, with a borrowed photo.',
  heroImage: {
    url: 'https://cdn.example.test/articles/wire.jpg',
    credit: 'Source: Example Wire',
    alt: 'A photo',
  },
  source: {
    name: 'Example Wire',
    articleUrl: 'https://example.com/news/wire-story',
    imageUrl: 'https://example.com/wire.jpg',
  },
});

const validRequest = (overrides: Record<string, unknown> = {}) => ({
  requesterName: 'Jamie Rights-Holder',
  requesterEmail: 'jamie@example.com',
  imageUrl: 'https://example.com/wire.jpg',
  claimType: 'copyright',
  explanation: 'That photograph is mine; it was used without a license.',
  goodFaithAssertion: true,
  ...overrides,
});

beforeAll(async () => {
  testDb = await useTestDatabase();
  const env = setTestEnv();
  app = createApp(env, { uploadService: fakeUploadService });
});

beforeEach(async () => {
  await testDb.truncateAll();
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
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

describe('takedown requests', () => {
  it('POST /api/takedown-requests needs no auth and returns only id + status, never the admin record', async () => {
    const res = await request(app).post('/api/takedown-requests').send(validRequest());
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String), status: 'pending' });
    expect(res.body.requesterEmail).toBeUndefined();
  });

  it('rejects a submission missing the required good-faith assertion', async () => {
    const res = await request(app)
      .post('/api/takedown-requests')
      .send(validRequest({ goodFaithAssertion: false }));
    expect(res.status).toBe(400);
  });

  it('rejects a submission with an invalid requester email', async () => {
    const res = await request(app)
      .post('/api/takedown-requests')
      .send(validRequest({ requesterEmail: 'not-an-email' }));
    expect(res.status).toBe(400);
  });

  it('GET /api/admin/takedown-requests requires auth', async () => {
    const res = await request(app).get('/api/admin/takedown-requests');
    expect(res.status).toBe(401);
  });

  it('admin can list a submitted request, resolved to the matching article, and action it', async () => {
    const token = await loginToken();
    const created = await request(app)
      .post('/api/admin/articles')
      .set('authorization', `Bearer ${token}`)
      .send(validArticle());
    expect(created.status).toBe(201);
    const publish = await request(app)
      .post(`/api/admin/articles/${created.body.id}/publish`)
      .set('authorization', `Bearer ${token}`);
    expect(publish.status).toBe(200);

    const submitted = await request(app).post('/api/takedown-requests').send(validRequest());
    expect(submitted.status).toBe(201);

    const list = await request(app)
      .get('/api/admin/takedown-requests')
      .set('authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].articleId).toBe(created.body.id);
    expect(list.body.data[0].status).toBe('pending');

    const actioned = await request(app)
      .post(`/api/admin/takedown-requests/${submitted.body.id}/action`)
      .set('authorization', `Bearer ${token}`)
      .send({
        status: 'actioned',
        apply: 'unpublish',
        resolution: 'Confirmed rights holder; took the story down.',
      });
    expect(actioned.status).toBe(200);
    expect(actioned.body.status).toBe('actioned');

    const article = await request(app)
      .get(`/api/admin/articles/${created.body.id}`)
      .set('authorization', `Bearer ${token}`);
    expect(article.body.status).toBe('draft');
  });

  it('admin filtering by status only returns matching requests', async () => {
    const token = await loginToken();
    const first = await request(app)
      .post('/api/takedown-requests')
      .send(validRequest({ requesterEmail: 'a@example.com' }));
    await request(app)
      .post('/api/takedown-requests')
      .send(validRequest({ requesterEmail: 'b@example.com' }));
    await request(app)
      .post(`/api/admin/takedown-requests/${first.body.id}/action`)
      .set('authorization', `Bearer ${token}`)
      .send({ status: 'dismissed', apply: 'none' });

    const pending = await request(app)
      .get('/api/admin/takedown-requests?status=pending')
      .set('authorization', `Bearer ${token}`);
    expect(pending.body.data).toHaveLength(1);
    expect(pending.body.data[0].requesterEmail).toBe('b@example.com');
  });
});
