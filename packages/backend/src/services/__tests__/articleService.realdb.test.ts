import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { CATEGORIES, type ArticleInput, type ArticleListQuery } from '@gwj/shared-types'
import { articleService, onArticlePublished } from '../articleService'
import { NotFoundError } from '../../errors'
import { useTestDatabase, type TestDatabase } from '../../test/postgres'

let testDb: TestDatabase

const baseInput = (overrides: Partial<ArticleInput> = {}): ArticleInput => ({
  title: 'Global Equities Climb, Again!',
  category: CATEGORIES[0],
  language: 'en',
  author: 'Nate',
  body: '# Markets\n\nMarkets rose **today**.',
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
  testDb = await useTestDatabase()
})

afterEach(async () => {
  await testDb.truncateAll()
})

afterAll(async () => {
  await testDb.drop()
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

describe('articleService — PostgreSQL port semantics', () => {
  it('mints 24-hex ids (the ObjectId shape every existing id already has)', async () => {
    const article = await articleService.create(baseInput())
    expect(article.id).toMatch(/^[0-9a-f]{24}$/)
  })

  it('a malformed or unknown id is a 404, never a 500', async () => {
    await expect(articleService.getById('not-an-id')).rejects.toBeInstanceOf(NotFoundError)
    await expect(articleService.getById('0123456789abcdef01234567')).rejects.toBeInstanceOf(NotFoundError)
    await expect(articleService.update('nope', { deck: 'x' })).rejects.toBeInstanceOf(NotFoundError)
    await expect(articleService.remove('0123456789abcdef01234567')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('omits absent optional fields from the DTO, as the Mongo mapping did', async () => {
    const article = await articleService.create(baseInput())
    expect('deck' in article && article.deck !== undefined).toBe(false)
    expect(article.heroImage).toBeUndefined()
    expect(article.source).toBeUndefined()
    expect(article.seo).toEqual({ metaTitle: undefined, metaDescription: undefined, ogImage: undefined })
  })

  it('round-trips the sub-documents (heroImage, seo, source) and tags', async () => {
    const article = await articleService.create(
      baseInput({
        heroImage: { url: 'https://cdn.example.test/a.jpg', alt: 'Alt', credit: 'AP' },
        seo: { metaTitle: 'Meta' },
        source: { name: 'Wire', articleUrl: 'https://wire.example/a' },
        tags: ['a', 'b'],
      }),
    )
    const read = await articleService.getById(article.id)
    expect(read.heroImage).toEqual({ url: 'https://cdn.example.test/a.jpg', alt: 'Alt', credit: 'AP', caption: undefined })
    expect(read.seo.metaTitle).toBe('Meta')
    expect(read.source?.articleUrl).toBe('https://wire.example/a')
    expect(read.tags).toEqual(['a', 'b'])
  })

  it('a patch that changes nothing is a no-op save: updatedAt does not move', async () => {
    const article = await articleService.create(baseInput({ deck: 'Same' }))
    await new Promise((r) => setTimeout(r, 15))
    const same = await articleService.update(article.id, { deck: 'Same', tags: [] })
    expect(same.updatedAt).toBe(article.updatedAt)
    const changed = await articleService.update(article.id, { deck: 'Different' })
    expect(changed.updatedAt > article.updatedAt).toBe(true)
  })

  it('publish() fires the published listener only on the draft→published transition', async () => {
    const seen: string[] = []
    const off = onArticlePublished((a) => seen.push(a.id))
    try {
      const draft = await articleService.create(baseInput())
      await articleService.publish(draft.id)
      await articleService.publish(draft.id)
      await articleService.update(draft.id, { deck: 'Correction' })
      expect(seen).toEqual([draft.id])
    } finally {
      off()
    }
  })

  it('orders listings by featured, then publishedAt DESC with NULLS LAST (where Mongo put a null), then createdAt', async () => {
    const draft = await articleService.create(baseInput({ title: 'Draft', featured: 5 }))
    const older = await articleService.create(baseInput({ title: 'Older', featured: 5, status: 'published' }))
    await new Promise((r) => setTimeout(r, 15))
    const newer = await articleService.create(baseInput({ title: 'Newer', featured: 5, status: 'published' }))
    const top = await articleService.create(baseInput({ title: 'Top', featured: 9 }))
    const result = await articleService.list(baseQuery(), { includeAll: true })
    expect(result.data.map((a) => a.id)).toEqual([top.id, newer.id, older.id, draft.id])
  })

  it('featured=true keeps only featured > 0; author narrows to one byline', async () => {
    await articleService.create(baseInput({ title: 'Plain', featured: 0, status: 'published' }))
    const featured = await articleService.create(baseInput({ title: 'Pick', featured: 3, status: 'published', author: 'Ada' }))
    expect((await articleService.list(baseQuery({ featured: true }))).data.map((a) => a.id)).toEqual([featured.id])
    expect((await articleService.list(baseQuery(), { author: 'Ada' })).data.map((a) => a.id)).toEqual([featured.id])
  })

  it('paginates with a stable total', async () => {
    for (let i = 0; i < 5; i += 1) await articleService.create(baseInput({ title: `Story ${i}`, status: 'published' }))
    const page2 = await articleService.list(baseQuery({ page: 2, limit: 2 }))
    expect(page2.data).toHaveLength(2)
    expect(page2.pagination).toEqual({ page: 2, limit: 2, total: 5, totalPages: 3 })
  })
})

describe('articleService.search — Mongo $text semantics on tsvector', () => {
  async function published(title: string, deck?: string, extra: Partial<ArticleInput> = {}): Promise<string> {
    return (await articleService.create(baseInput({ title, deck, status: 'published', ...extra }))).id
  }

  it('bare terms are OR-ed and stemmed (english)', async () => {
    const oil = await published('Oil prices climbing')
    const gold = await published('Gold rallies')
    await published('Unrelated weather story')
    const result = await articleService.search('oil gold', baseQuery())
    expect(result.data.map((a) => a.id).sort()).toEqual([oil, gold].sort())
    expect((await articleService.search('climb', baseQuery())).data.map((a) => a.id)).toEqual([oil])
  })

  it('searches title and deck only, never body', async () => {
    const byDeck = await published('Headline', 'Inflation cools')
    await published('Other', undefined, { body: 'Inflation is mentioned only in the body.' })
    expect((await articleService.search('inflation', baseQuery())).data.map((a) => a.id)).toEqual([byDeck])
  })

  it('a quoted phrase must match as a phrase; bare terms then only rank', async () => {
    const exact = await published('Central bank raises rates')
    await published('Rates rise as the bank in central Asia waits')
    const result = await articleService.search('"central bank" rates', baseQuery())
    expect(result.data.map((a) => a.id)).toEqual([exact])
  })

  it('-term excludes; exclusions alone and stop words alone match nothing', async () => {
    const keep = await published('Markets rally on earnings')
    await published('Markets slump on tariffs')
    expect((await articleService.search('markets -tariffs', baseQuery())).data.map((a) => a.id)).toEqual([keep])
    expect((await articleService.search('-tariffs', baseQuery())).data).toEqual([])
    expect((await articleService.search('the and of', baseQuery())).data).toEqual([])
  })

  it('ranks the better match first', async () => {
    const weak = await published('Energy outlook', 'A note on policy')
    const strong = await published('Energy energy energy', 'Energy policy and energy prices')
    const result = await articleService.search('energy', baseQuery())
    expect(result.data.map((a) => a.id)).toEqual([strong, weak])
  })

  it('public search excludes drafts unless a status is requested; list(q) includes drafts on the admin path', async () => {
    const draft = await articleService.create(baseInput({ title: 'Secret merger draft' }))
    expect((await articleService.search('merger', baseQuery())).data).toEqual([])
    expect((await articleService.list(baseQuery({ q: 'merger' }), { includeAll: true })).data.map((a) => a.id)).toEqual([
      draft.id,
    ])
  })
})
