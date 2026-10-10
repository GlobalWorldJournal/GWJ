import { afterEach, describe, expect, it, vi } from 'vitest'
import { BackendError, createGwjClient, type GwjClientOptions } from '../client.js'
import { makeTruncatedPng, makeValidPng } from './imageFixtures.js'

/** A real, complete PNG large enough to pass the validator's min-dimension gate. */
const VALID_PNG = makeValidPng(800, 700)
/** A PNG truncated mid-IDAT (no IEND) — the corruption that shipped. */
const TRUNCATED_PNG = makeTruncatedPng(800, 700)


type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]
type FetchHandler = (url: string, init?: FetchInit) => Response | Promise<Response>

/** Minimal fetch double whose responses are scripted per call. */
function scriptedFetch(handlers: FetchHandler[]): typeof fetch {
  let call = 0
  return async (input: FetchInput, init?: FetchInit): Promise<Response> => {
    const handler = handlers[call++]
    if (!handler) throw new Error(`unexpected fetch call #${call}`)
    const url = typeof input === 'string' ? input : input.toString()
    return handler(url, init)
  }
}

function loginResponse(): Response {
  return new Response(
    JSON.stringify({ token: 'jwt-token', user: { username: 'nate', role: 'admin' } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

function uploadResponse(): Response {
  return new Response(JSON.stringify({ url: 'https://cdn.example.com/articles/abc-hero.jpg' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function articleResponse(id: string): Response {
  const now = new Date().toISOString()
  return new Response(
    JSON.stringify({
      id,
      slug: 'sample',
      title: 'Sample',
      category: 'World',
      author: 'nate',
      body: 'Sample body.',
      status: 'draft',
      featured: 0,
      tags: [],
      seo: {},
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

function baseOptions(overrides: Partial<GwjClientOptions>): GwjClientOptions {
  return {
    apiBaseUrl: 'https://api.example.com',
    adminUsername: 'nate',
    adminPassword: 'pw',
    ...overrides,
  }
}

describe('client.uploadImage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('hands a remote URL to the backend (which downloads it behind its SSRF guard); MCP never fetches it', async () => {
    const fetchImpl = scriptedFetch([
      () => loginResponse(),
      (url, init) => {
        expect(url).toBe('https://api.example.com/api/admin/upload/from-url')
        expect(init?.method).toBe('POST')
        expect(JSON.parse(String(init?.body))).toEqual({ url: 'https://cdn.example.com/x.png', filename: 'x.png' })
        return uploadResponse()
      },
    ])
    const client = createGwjClient(baseOptions({ fetch: fetchImpl }))
    const result = await client.uploadImage({ url: 'https://cdn.example.com/x.png', filename: 'x.png' })
    expect(result.url).toBe('https://cdn.example.com/articles/abc-hero.jpg')
  })

  it('surfaces the backend refusing an unusable source as a BackendError with its status', async () => {
    const fetchImpl = scriptedFetch([
      () => loginResponse(),
      () =>
        new Response(JSON.stringify({ error: 'Source URL did not return an image', details: { reason: 'not-image' } }), {
          status: 422,
          headers: { 'content-type': 'application/json' },
        }),
    ])
    const client = createGwjClient(baseOptions({ fetch: fetchImpl }))
    await expect(client.uploadImage({ url: 'https://cdn.example.com/x.html', filename: 'x.png' })).rejects.toMatchObject({
      status: 422,
      message: 'Source URL did not return an image',
    })
  })

  it('uploads base64 under the format detected from its bytes', async () => {
    const fetchImpl = scriptedFetch([
      () => loginResponse(),
      (url, init) => {
        expect(url).toBe('https://api.example.com/api/admin/upload')
        const file = (init?.body as FormData).get('file')
        expect(file).toBeInstanceOf(Blob)
        expect((file as Blob).type).toBe('image/png')
        return uploadResponse()
      },
    ])
    const client = createGwjClient(baseOptions({ fetch: fetchImpl }))
    const png = Buffer.from(VALID_PNG).toString('base64')
    const result = await client.uploadImage({ base64: `data:image/jpeg;base64,${png}`, filename: 'x.jpg' })
    expect(result.url).toBe('https://cdn.example.com/articles/abc-hero.jpg')
  })

  it('rejects a base64 payload that is not a complete image', async () => {
    // An agent passing corrupt/truncated base64 must be told to re-source rather
    // than silently uploading a broken image.
    const fetchImpl = scriptedFetch([])
    const client = createGwjClient(baseOptions({ fetch: fetchImpl }))
    const corrupt = Buffer.from(TRUNCATED_PNG).toString('base64')
    await expect(
      client.uploadImage({ base64: corrupt, filename: 'x.png' }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('reports a missing source as a BackendError', async () => {
    const fetchImpl = scriptedFetch([])
    const client = createGwjClient(baseOptions({ fetch: fetchImpl }))
    await expect(client.uploadImage({ filename: 'x.png' })).rejects.toBeInstanceOf(BackendError)
  })
})

describe('client.listArticles', () => {
  it('forwards every filter, including language and featured=false', async () => {
    const fetchImpl = scriptedFetch([
      () => loginResponse(),
      (url) => {
        const params = new URL(url).searchParams
        expect(Object.fromEntries(params)).toEqual({
          language: 'es',
          featured: 'false',
          status: 'published',
          q: 'otan',
          page: '1',
          limit: '20',
        })
        return new Response(JSON.stringify({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    ])
    const client = createGwjClient(baseOptions({ fetch: fetchImpl }))
    const result = await client.listArticles({ language: 'es', featured: false, status: 'published', q: 'otan' })
    expect(result.data).toEqual([])
  })
})

describe('client.deleteArticle (backend returns 204 No Content)', () => {
  it('treats a 204 with no body as success and synthesizes { deleted, id }', async () => {
    const fetchImpl = scriptedFetch([
      () => loginResponse(),
      (url, init) => {
        expect(url).toBe('https://api.example.com/api/admin/articles/abc')
        expect(init?.method).toBe('DELETE')
        return new Response(null, { status: 204 })
      },
    ])
    const client = createGwjClient(baseOptions({ fetch: fetchImpl }))
    const result = await client.deleteArticle('abc')
    expect(result).toEqual({ deleted: true, id: 'abc' })
  })

  it('treats a 200 with no body as success too', async () => {
    const fetchImpl = scriptedFetch([() => loginResponse(), () => new Response(null, { status: 200 })])
    const client = createGwjClient(baseOptions({ fetch: fetchImpl }))
    await expect(client.deleteArticle('abc')).resolves.toEqual({ deleted: true, id: 'abc' })
  })

  it('surfaces a non-2xx delete as a BackendError', async () => {
    const fetchImpl = scriptedFetch([
      () => loginResponse(),
      () =>
        new Response(JSON.stringify({ error: 'not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
    ])
    const client = createGwjClient(baseOptions({ fetch: fetchImpl }))
    await expect(client.deleteArticle('missing')).rejects.toBeInstanceOf(BackendError)
  })
})

describe('client.getArticle (admin routes, includes drafts)', () => {
  it('fetches by id at /api/admin/articles/:id', async () => {
    const fetchImpl = scriptedFetch([
      () => loginResponse(),
      (url) => {
        expect(url).toBe('https://api.example.com/api/admin/articles/the-id')
        return articleResponse('the-id')
      },
    ])
    const client = createGwjClient(baseOptions({ fetch: fetchImpl }))
    const article = await client.getArticle({ id: 'the-id' })
    expect(article.id).toBe('the-id')
  })

  it('fetches by slug at /api/admin/articles/by-slug/:slug', async () => {
    const fetchImpl = scriptedFetch([
      () => loginResponse(),
      (url) => {
        expect(url).toBe('https://api.example.com/api/admin/articles/by-slug/my-slug')
        return articleResponse('id-for-slug')
      },
    ])
    const client = createGwjClient(baseOptions({ fetch: fetchImpl }))
    const article = await client.getArticle({ slug: 'my-slug' })
    expect(article.id).toBe('id-for-slug')
  })

  it('rejects when neither id nor slug is provided', async () => {
    const fetchImpl = scriptedFetch([])
    const client = createGwjClient(baseOptions({ fetch: fetchImpl }))
    await expect(client.getArticle({})).rejects.toBeInstanceOf(BackendError)
  })
})
