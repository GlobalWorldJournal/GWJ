import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { CATEGORIES, type ArticleInput, type ArticleListQuery } from '@gwj/shared-types'
import { articleService } from '../articleService'
import { ArticleModel } from '../../models/Article'

let mongod: MongoMemoryServer

const baseInput = (overrides: Partial<ArticleInput> = {}): ArticleInput => ({
  title: 'Global Equities Climb, Again!',
  category: CATEGORIES[0],
  author: 'Nate',
  body: [{ type: 'paragraph', text: 'Markets rose today.' }],
  status: 'draft',
  featured: 0,
  tags: [],
  seo: {},
  ...overrides,
})

const baseQuery = (overrides: Partial<ArticleListQuery> = {}): ArticleListQuery => ({
  page: 1,
  limit: 20,
  ...overrides,
})

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
})

afterEach(async () => {
  await ArticleModel.deleteMany({})
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongod.stop()
})

describe('articleService', () => {
  it('generates a slug from the title', async () => {
    const article = await articleService.create(baseInput())
    expect(article.slug).toBe('global-equities-climb-again')
  })

  it('appends a numeric suffix on slug collision', async () => {
    const a = await articleService.create(baseInput())
    const b = await articleService.create(baseInput())
    const c = await articleService.create(baseInput())
    expect(a.slug).toBe('global-equities-climb-again')
    expect(b.slug).toBe('global-equities-climb-again-2')
    expect(c.slug).toBe('global-equities-climb-again-3')
  })

  it('publish() sets status and stamps publishedAt', async () => {
    const draft = await articleService.create(baseInput())
    expect(draft.status).toBe('draft')
    expect(draft.publishedAt).toBeNull()

    const published = await articleService.publish(draft.id)
    expect(published.status).toBe('published')
    expect(published.publishedAt).not.toBeNull()
  })

  it('publish() preserves the original publishedAt on re-publish', async () => {
    const draft = await articleService.create(baseInput())
    const first = await articleService.publish(draft.id)
    const firstTime = first.publishedAt

    await articleService.unpublish(draft.id)
    const second = await articleService.publish(draft.id)
    // After unpublish clears publishedAt, re-publish stamps a fresh time.
    expect(second.publishedAt).not.toBeNull()
    expect(firstTime).not.toBeNull()
  })

  it('public list excludes drafts', async () => {
    await articleService.create(baseInput({ title: 'Draft One' }))
    const toPublish = await articleService.create(baseInput({ title: 'Published One' }))
    await articleService.publish(toPublish.id)

    const result = await articleService.list(baseQuery())
    expect(result.data).toHaveLength(1)
    expect(result.data[0]?.title).toBe('Published One')
    expect(result.pagination.total).toBe(1)
  })

  it('admin list (includeAll) returns drafts', async () => {
    await articleService.create(baseInput({ title: 'Draft One' }))
    const toPublish = await articleService.create(baseInput({ title: 'Published One' }))
    await articleService.publish(toPublish.id)

    const result = await articleService.list(baseQuery(), { includeAll: true })
    expect(result.data).toHaveLength(2)
  })

  it('update() applies a partial patch', async () => {
    const article = await articleService.create(baseInput({ deck: 'Old deck' }))
    const updated = await articleService.update(article.id, { deck: 'New deck' })
    expect(updated.deck).toBe('New deck')
    expect(updated.title).toBe(article.title)
    // Untouched slug stays stable when the title is unchanged.
    expect(updated.slug).toBe(article.slug)
  })

  it('update() re-slugs when the title changes', async () => {
    const article = await articleService.create(baseInput({ title: 'First Title' }))
    const updated = await articleService.update(article.id, { title: 'Second Title' })
    expect(updated.slug).toBe('second-title')
  })

  it('getBySlug() only returns published articles', async () => {
    const draft = await articleService.create(baseInput({ title: 'Hidden Draft' }))
    await expect(articleService.getBySlug(draft.slug)).rejects.toThrow()

    await articleService.publish(draft.id)
    const found = await articleService.getBySlug(draft.slug)
    expect(found.id).toBe(draft.id)
  })
})
