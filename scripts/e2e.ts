/**
 * End-to-end cross-package contract test.
 *
 * Boots a real backend (Express + Mongoose against an in-memory MongoDB) and
 * drives it through the @gwj/mcp HTTP client over real HTTP, verifying the
 * agent → MCP → backend → DB → public-API data path and that the route shapes
 * (login, admin create/get/publish/delete, 204 delete, public list) all line up.
 *
 * Run: bun run scripts/e2e.ts   (disable the command sandbox — mongodb-memory-server
 * needs a writable /tmp for its unix socket).
 */
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { Server } from 'node:http'

// Configure env BEFORE loading modules that read it (loadEnv is lazy anyway).
const mongo = await MongoMemoryServer.create()
process.env.MONGO_URI = mongo.getUri()
process.env.JWT_SECRET = 'e2e-jwt-secret-not-for-prod'
process.env.ADMIN_USERNAME = 'nate'
process.env.ADMIN_PASSWORD = 'e2e-admin-password'
process.env.AWS_REGION = 'us-east-1'
process.env.AWS_ACCESS_KEY_ID = 'e2e'
process.env.AWS_SECRET_ACCESS_KEY = 'e2e'
process.env.S3_BUCKET = 'e2e-bucket'
process.env.CDN_BASE_URL = 'https://cdn.example.com'
process.env.CORS_ORIGINS = 'http://localhost:5173'
process.env.NODE_ENV = 'test'

const { loadEnv } = await import('../packages/backend/src/env')
const { connectDb, disconnectDb } = await import('../packages/backend/src/db')
const { createApp } = await import('../packages/backend/src/app')
const { seedCategories, seedAdminUser } = await import('../packages/backend/src/seed')
const { createGwjClient } = await import('../packages/mcp/src/client')

let failures = 0
function check(label: string, ok: boolean): void {
  if (ok) {
    console.log(`  ✓ ${label}`)
  } else {
    failures += 1
    console.log(`  ✗ ${label}`)
  }
}

const env = loadEnv()
await connectDb(env.MONGO_URI)
await seedCategories()
await seedAdminUser(env)

const app = createApp(env, {
  uploadService: {
    uploadImage: async () => ({ url: 'https://cdn.example.com/uploads/fake.jpg' }),
  },
})
const PORT = 4321
const server: Server = await new Promise((resolve) => {
  const s = app.listen(PORT, () => resolve(s))
})
const apiBaseUrl = `http://127.0.0.1:${PORT}`

try {
  const client = createGwjClient({
    apiBaseUrl,
    adminUsername: 'nate',
    adminPassword: 'e2e-admin-password',
  })

  const categories = await client.listCategories()
  check('list_categories returns the 7 seeded categories', categories.length === 7)

  const created = await client.createArticle({
    title: 'Global Equities Climb as Central Banks Signal a Pause',
    deck: 'Investors bet the tightening cycle is nearing its end.',
    kicker: 'Markets',
    category: 'Markets',
    author: 'A. Reporter',
    body: [{ type: 'paragraph', text: 'Stocks rose across major markets Tuesday.' }],
    status: 'draft',
    featured: 0,
    tags: ['rates'],
    seo: {},
  })
  check('create_article returns a slug', created.slug.length > 0)
  check('new article starts as a draft', created.status === 'draft')

  const fetchedById = await client.getArticle({ id: created.id })
  check('get_article by id returns the draft', fetchedById.id === created.id)

  const fetchedBySlug = await client.getArticle({ slug: created.slug })
  check('get_article by slug returns the draft', fetchedBySlug.id === created.id)

  // Draft must NOT be visible on the public list yet.
  const publicBefore = await fetch(`${apiBaseUrl}/api/articles`).then((r) => r.json())
  check('draft is hidden from public list', publicBefore.data.length === 0)

  const published = await client.publishArticle(created.id)
  check('publish_article flips status to published', published.status === 'published')
  check('publish sets publishedAt', published.publishedAt !== null)

  const publicAfter = await fetch(`${apiBaseUrl}/api/articles`).then((r) => r.json())
  check('published article appears on public list', publicAfter.data.length === 1)

  const bySlug = await fetch(
    `${apiBaseUrl}/api/articles/${encodeURIComponent(created.slug)}`,
  ).then((r) => r.json())
  check('public article-by-slug returns it', bySlug.slug === created.slug)

  const del = await client.deleteArticle(created.id)
  check('delete_article returns {deleted:true} on 204', del.deleted === true && del.id === created.id)

  const publicFinal = await fetch(`${apiBaseUrl}/api/articles`).then((r) => r.json())
  check('article is gone after delete', publicFinal.data.length === 0)
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await disconnectDb()
  await mongo.stop()
}

if (failures > 0) {
  console.log(`\nE2E FAILED: ${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nE2E PASSED: agent → MCP client → backend → DB → public API verified')
