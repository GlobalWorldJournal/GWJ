import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { CATEGORIES, type ArticleInput, type TakedownRequestInput } from '@gwj/shared-types'
import { takedownService } from '../takedownService'
import { articleService } from '../articleService'
import { ArticleModel } from '../../models/Article'
import { TakedownRequestModel } from '../../models/TakedownRequest'

let mongod: MongoMemoryServer

const baseArticle = (overrides: Partial<ArticleInput> = {}): ArticleInput => ({
  title: 'A Story With A Borrowed Photo',
  category: CATEGORIES[0],
  language: 'en',
  author: 'Nate',
  body: '# Story\n\nSomething happened.',
  status: 'published',
  featured: 0,
  tags: [],
  seo: {},
  heroImage: { url: 'https://cdn.globalworldjournal.com/articles/photo.jpg', credit: 'Source: Example Wire', alt: 'A photo' },
  source: { name: 'Example Wire', articleUrl: 'https://example.com/news/story', imageUrl: 'https://example.com/photo.jpg' },
  ...overrides,
})

const baseInput = (overrides: Partial<TakedownRequestInput> = {}): TakedownRequestInput => ({
  requesterName: 'Jamie Rights-Holder',
  requesterEmail: 'jamie@example.com',
  claimType: 'copyright',
  explanation: 'That is my photograph, used without a license.',
  goodFaithAssertion: true,
  ...overrides,
})

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
})

afterEach(async () => {
  await ArticleModel.deleteMany({})
  await TakedownRequestModel.deleteMany({})
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongod.stop()
})

describe('takedownService', () => {
  it('creates a pending request with no article match when nothing resolves', async () => {
    const record = await takedownService.create(baseInput({ imageUrl: 'https://unrelated.example/photo.jpg' }))
    expect(record.status).toBe('pending')
    expect(record.articleId).toBeNull()
  })

  it('resolves the article by its own /article/<slug> URL', async () => {
    const article = await articleService.create(baseArticle())
    const record = await takedownService.create(
      baseInput({ articleUrl: `https://globalworldjournal.com/article/${article.slug}` }),
    )
    expect(record.articleId).toBe(article.id)
  })

  it('resolves the article by the original source image URL we recorded internally', async () => {
    const article = await articleService.create(baseArticle())
    const record = await takedownService.create(baseInput({ imageUrl: 'https://example.com/photo.jpg' }))
    expect(record.articleId).toBe(article.id)
  })

  it('resolves the article by our own CDN hero image URL', async () => {
    const article = await articleService.create(baseArticle())
    const record = await takedownService.create(
      baseInput({ imageUrl: 'https://cdn.globalworldjournal.com/articles/photo.jpg' }),
    )
    expect(record.articleId).toBe(article.id)
  })

  it('action("dismissed") records a resolution without touching the article', async () => {
    const article = await articleService.create(baseArticle())
    const record = await takedownService.create(baseInput({ imageUrl: 'https://example.com/photo.jpg' }))
    const dismissed = await takedownService.action(record.id, {
      status: 'dismissed',
      resolution: 'No credible claim; the image is wire-service licensed.',
      apply: 'none',
    })
    expect(dismissed.status).toBe('dismissed')
    expect(dismissed.resolution).toContain('wire-service')
    const stillThere = await articleService.getById(article.id)
    expect(stillThere.status).toBe('published')
    expect(stillThere.heroImage?.url).toBe(article.heroImage?.url)
  })

  it('action("actioned", apply: "unpublish") takes the whole article down', async () => {
    const article = await articleService.create(baseArticle())
    const record = await takedownService.create(baseInput({ imageUrl: 'https://example.com/photo.jpg' }))
    await takedownService.action(record.id, { status: 'actioned', apply: 'unpublish' })
    const after = await articleService.getById(article.id)
    expect(after.status).toBe('draft')
  })

  it('action("actioned", apply: "clear-hero-image") removes just the image, leaves the article published', async () => {
    const article = await articleService.create(baseArticle())
    const record = await takedownService.create(baseInput({ imageUrl: 'https://example.com/photo.jpg' }))
    const actioned = await takedownService.action(record.id, { status: 'actioned', apply: 'clear-hero-image' })
    expect(actioned.status).toBe('actioned')
    const after = await articleService.getById(article.id)
    expect(after.status).toBe('published')
    expect(after.heroImage).toBeUndefined()
  })

  it('lists requests newest first, filterable by status', async () => {
    const first = await takedownService.create(baseInput({ requesterEmail: 'a@example.com' }))
    const second = await takedownService.create(baseInput({ requesterEmail: 'b@example.com' }))
    await takedownService.action(first.id, { status: 'dismissed', apply: 'none' })

    const all = await takedownService.list({ page: 1, limit: 20 })
    expect(all.data.map((r) => r.id)).toEqual([second.id, first.id])

    const pending = await takedownService.list({ status: 'pending', page: 1, limit: 20 })
    expect(pending.data.map((r) => r.id)).toEqual([second.id])
  })
})
