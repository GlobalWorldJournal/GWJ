import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import request from 'supertest'
import type { Express } from 'express'
import { CATEGORIES } from '@gwj/shared-types'
import { loadEnv, resetEnvCache, type Env } from '../env'
import { createApp } from '../app'
import { getDb } from '../db/client'
import { newRecordId } from '../db/ids'
import { users } from '../db/schema/users'
import { useTestDatabase, type TestDatabase } from '../test/postgres'
import { type UploadService } from '../services/uploadService'
import { tooSmallPngBuffer, truncatedPngBuffer, validPngBuffer } from './imageFixtures'

let testDb: TestDatabase
let app: Express

const ADMIN_USERNAME = 'nate'
const ADMIN_PASSWORD = 'super-secret-pw'

const fakeUploadService: UploadService = {
  async uploadImage(_buffer, filename) {
    return { url: `https://cdn.example.test/articles/${filename}` }
  },
}

function setTestEnv(): Env {
  process.env.NODE_ENV = 'test'
  process.env.PORT = '4000'
  process.env.DATABASE_URL = testDb.url
  process.env.JWT_SECRET = 'test-jwt-secret'
  process.env.ADMIN_USERNAME = ADMIN_USERNAME
  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD
  process.env.AWS_REGION = 'us-east-1'
  // AWS static keys are optional (ECS uses the task role); omit them here so the
  // app boots without them. Upload itself is exercised via a fake upload service.
  delete process.env.AWS_ACCESS_KEY_ID
  delete process.env.AWS_SECRET_ACCESS_KEY
  process.env.S3_BUCKET = 'test-bucket'
  process.env.CDN_BASE_URL = 'https://cdn.example.test'
  process.env.CORS_ORIGINS = 'https://globalworldjournal.com'
  resetEnvCache()
  return loadEnv()
}

const validArticle = () => ({
  title: 'Breaking: Markets Rally',
  deck: 'Stocks surge on optimism',
  kicker: 'MARKETS',
  category: CATEGORIES[2],
  author: 'Nate',
  body: '# Markets Rally\n\nA strong session **today**.',
  tags: ['markets'],
})

beforeAll(async () => {
  testDb = await useTestDatabase()
  const env = setTestEnv()
  app = createApp(env, { uploadService: fakeUploadService })
})

beforeEach(async () => {
  await testDb.truncateAll()
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10)
  await getDb().insert(users).values({ id: newRecordId(), username: ADMIN_USERNAME, passwordHash, role: 'admin' })
})

afterAll(async () => {
  await testDb.drop()
})

async function loginToken(): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD })
  expect(res.status).toBe(200)
  return res.body.token as string
}

describe('GWJ API', () => {
  it('GET /healthz returns ok', async () => {
    const res = await request(app).get('/healthz')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('login returns a token and the admin user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD })
    expect(res.status).toBe(200)
    expect(typeof res.body.token).toBe('string')
    expect(res.body.user).toEqual({ username: ADMIN_USERNAME, role: 'admin' })
  })

  it('login with wrong password returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: ADMIN_USERNAME, password: 'wrong' })
    expect(res.status).toBe(401)
  })

  it('POST /api/admin/articles without a token returns 401', async () => {
    const res = await request(app).post('/api/admin/articles').send(validArticle())
    expect(res.status).toBe(401)
  })

  it('POST /api/admin/articles with an invalid body returns 400 with details', async () => {
    const token = await loginToken()
    const res = await request(app)
      .post('/api/admin/articles')
      .set('authorization', `Bearer ${token}`)
      .send({ title: '', category: 'Sports', author: '' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Validation failed')
    expect(res.body.details).toBeDefined()
  })

  it('create -> publish -> GET /api/articles/:slug returns the article', async () => {
    const token = await loginToken()

    const created = await request(app)
      .post('/api/admin/articles')
      .set('authorization', `Bearer ${token}`)
      .send(validArticle())
    expect(created.status).toBe(201)
    const { id, slug } = created.body

    const beforePublish = await request(app).get(`/api/articles/${slug}`)
    expect(beforePublish.status).toBe(404)

    const published = await request(app)
      .post(`/api/admin/articles/${id}/publish`)
      .set('authorization', `Bearer ${token}`)
    expect(published.status).toBe(200)
    expect(published.body.status).toBe('published')

    const fetched = await request(app).get(`/api/articles/${slug}`)
    expect(fetched.status).toBe(200)
    expect(fetched.body.slug).toBe(slug)
    expect(fetched.body.title).toBe(validArticle().title)
  })

  it('draft articles are excluded from GET /api/articles', async () => {
    const token = await loginToken()

    await request(app)
      .post('/api/admin/articles')
      .set('authorization', `Bearer ${token}`)
      .send({ ...validArticle(), title: 'A Draft Story' })

    const publishedReq = await request(app)
      .post('/api/admin/articles')
      .set('authorization', `Bearer ${token}`)
      .send({ ...validArticle(), title: 'A Published Story' })
    await request(app)
      .post(`/api/admin/articles/${publishedReq.body.id}/publish`)
      .set('authorization', `Bearer ${token}`)

    const publicList = await request(app).get('/api/articles')
    expect(publicList.status).toBe(200)
    expect(publicList.body.data).toHaveLength(1)
    expect(publicList.body.data[0].title).toBe('A Published Story')

    const adminList = await request(app)
      .get('/api/admin/articles')
      .set('authorization', `Bearer ${token}`)
    expect(adminList.body.data).toHaveLength(2)
  })

  it('GET /api/categories returns the 7 fixed categories', async () => {
    const res = await request(app).get('/api/categories')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(CATEGORIES.length)
    expect(res.body.map((c: { name: string }) => c.name)).toEqual([...CATEGORIES])
  })

  it('admin can fetch a DRAFT by id and by slug; public route still hides it', async () => {
    const token = await loginToken()

    const created = await request(app)
      .post('/api/admin/articles')
      .set('authorization', `Bearer ${token}`)
      .send({ ...validArticle(), title: 'A Hidden Draft' })
    expect(created.status).toBe(201)
    const { id, slug } = created.body
    expect(created.body.status).toBe('draft')

    const byId = await request(app)
      .get(`/api/admin/articles/${id}`)
      .set('authorization', `Bearer ${token}`)
    expect(byId.status).toBe(200)
    expect(byId.body.id).toBe(id)
    expect(byId.body.status).toBe('draft')

    const bySlug = await request(app)
      .get(`/api/admin/articles/by-slug/${slug}`)
      .set('authorization', `Bearer ${token}`)
    expect(bySlug.status).toBe(200)
    expect(bySlug.body.slug).toBe(slug)
    expect(bySlug.body.status).toBe('draft')

    // The public route remains published-only.
    const publicGet = await request(app).get(`/api/articles/${slug}`)
    expect(publicGet.status).toBe(404)
  })

  it('admin single-get returns 404 for a missing id/slug', async () => {
    const token = await loginToken()

    const missingId = await request(app)
      .get('/api/admin/articles/64b7f0f0f0f0f0f0f0f0f0f0')
      .set('authorization', `Bearer ${token}`)
    expect(missingId.status).toBe(404)

    const missingSlug = await request(app)
      .get('/api/admin/articles/by-slug/does-not-exist')
      .set('authorization', `Bearer ${token}`)
    expect(missingSlug.status).toBe(404)
  })

  it('admin single-get requires a token (401 without one)', async () => {
    const created = await request(app)
      .post('/api/admin/articles')
      .set('authorization', `Bearer ${await loginToken()}`)
      .send({ ...validArticle(), title: 'Token Guard Check' })
    const { id, slug } = created.body

    const byId = await request(app).get(`/api/admin/articles/${id}`)
    expect(byId.status).toBe(401)

    const bySlug = await request(app).get(`/api/admin/articles/by-slug/${slug}`)
    expect(bySlug.status).toBe(401)
  })

  describe('POST /api/admin/upload (image validation)', () => {
    it('accepts a complete, large-enough image and returns 201 with a url', async () => {
      const token = await loginToken()
      const res = await request(app)
        .post('/api/admin/upload')
        .set('authorization', `Bearer ${token}`)
        .attach('file', validPngBuffer(800, 700), { filename: 'hero.png', contentType: 'image/png' })
      expect(res.status).toBe(201)
      expect(typeof res.body.url).toBe('string')
      expect(res.body.url).toMatch(/^https:\/\/cdn\.example\.test\/articles\//)
    })

    it('rejects a truncated/corrupt image with 422 and an actionable reason', async () => {
      const token = await loginToken()
      const res = await request(app)
        .post('/api/admin/upload')
        .set('authorization', `Bearer ${token}`)
        .attach('file', truncatedPngBuffer(800, 700), {
          filename: 'broken.png',
          contentType: 'image/png',
        })
      expect(res.status).toBe(422)
      expect(res.body.error).toMatch(/Rejected image upload/i)
      expect(res.body.details).toMatchObject({ reason: 'truncated' })
    })

    it('rejects a non-image (HTML) payload with 422', async () => {
      const token = await loginToken()
      const res = await request(app)
        .post('/api/admin/upload')
        .set('authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('<!doctype html><html></html>'), {
          filename: 'page.png',
          contentType: 'image/png',
        })
      expect(res.status).toBe(422)
      expect(res.body.details).toMatchObject({ reason: 'unknown-format' })
    })

    it('rejects an image below the minimum dimension with 422', async () => {
      const token = await loginToken()
      const res = await request(app)
        .post('/api/admin/upload')
        .set('authorization', `Bearer ${token}`)
        .attach('file', tooSmallPngBuffer(), { filename: 'tiny.png', contentType: 'image/png' })
      expect(res.status).toBe(422)
      expect(res.body.details).toMatchObject({ reason: 'too-small' })
    })

    it('rejects an upload with no file (400)', async () => {
      const token = await loginToken()
      const res = await request(app)
        .post('/api/admin/upload')
        .set('authorization', `Bearer ${token}`)
      expect(res.status).toBe(400)
    })
  })
})
