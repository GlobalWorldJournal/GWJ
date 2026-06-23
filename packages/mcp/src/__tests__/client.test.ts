import type { LookupAddress } from 'node:dns'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BackendError, createGwjClient, type GwjClientOptions } from '../client.js'
import { SsrfError } from '../ssrfGuard.js'
import { makeTruncatedPng, makeValidPng } from './imageFixtures.js'

/** A real, complete PNG large enough to pass the validator's min-dimension gate. */
const VALID_PNG = makeValidPng(800, 700)
/** A PNG truncated mid-IDAT (no IEND) — the corruption that shipped. */
const TRUNCATED_PNG = makeTruncatedPng(800, 700)

const PUBLIC_RESOLVER = async (): Promise<LookupAddress[]> => [{ address: '93.184.216.34', family: 4 }]
const LOOPBACK_RESOLVER = async (): Promise<LookupAddress[]> => [{ address: '127.0.0.1', family: 4 }]

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]
type FetchHandler = (url: string, init?: FetchInit) => Response

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

/** Respond with raw bytes and a content-type (defaults to PNG). */
function imageResponse(
  body: Uint8Array,
  extraHeaders: Record<string, string> = {},
  contentType = 'image/png',
): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': contentType, ...extraHeaders },
  })
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
    resolveDns: PUBLIC_RESOLVER,
    ...overrides,
  }
}

describe('client.uploadImage url branch (SSRF-hardened)', () => {
  afterEach(() => vi.restoreAllMocks())

  // Note: uploadImage fetches the remote image FIRST (resolveImageBytes), then
  // logs in lazily, then POSTs the upload. So the call order is [image, login, upload].

  it('blocks a url whose host resolves to loopback (never reaches fetch)', async () => {
    // The SSRF guard rejects before any network egress → fetch must never be called.
    const fetchImpl = scriptedFetch([])
    const client = createGwjClient(baseOptions({ fetch: fetchImpl, resolveDns: LOOPBACK_RESOLVER }))
    await expect(
      client.uploadImage({ url: 'https://evil.example.com/x.jpg', filename: 'x.jpg' }),
    ).rejects.toBeInstanceOf(SsrfError)
  })

  it('rejects a 3xx redirect instead of following it', async () => {
    const fetchImpl = scriptedFetch([
      (_url, init) => {
        expect(init?.redirect).toBe('manual')
        return new Response(null, { status: 302, headers: { location: 'https://internal/' } })
      },
    ])
    const client = createGwjClient(baseOptions({ fetch: fetchImpl }))
    await expect(
      client.uploadImage({ url: 'https://cdn.example.com/x.jpg', filename: 'x.jpg' }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/redirect/i) })
  })

  it('rejects a non-image content-type', async () => {
    const fetchImpl = scriptedFetch([
      () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    ])
    const client = createGwjClient(baseOptions({ fetch: fetchImpl }))
    await expect(
      client.uploadImage({ url: 'https://cdn.example.com/x.jpg', filename: 'x.jpg' }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/did not return an image/i) })
  })

  it('rejects an image larger than 10 MB (declared content-length)', async () => {
    const fetchImpl = scriptedFetch([
      () => imageResponse(new Uint8Array(8), { 'content-length': String(11 * 1024 * 1024) }),
    ])
    const client = createGwjClient(baseOptions({ fetch: fetchImpl }))
    await expect(
      client.uploadImage({ url: 'https://cdn.example.com/x.png', filename: 'x.png' }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/10 MB/i) })
  })

  it('rejects an image larger than 10 MB (actual body even without content-length)', async () => {
    const fetchImpl = scriptedFetch([() => imageResponse(new Uint8Array(11 * 1024 * 1024))])
    const client = createGwjClient(baseOptions({ fetch: fetchImpl }))
    await expect(
      client.uploadImage({ url: 'https://cdn.example.com/x.png', filename: 'x.png' }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/10 MB/i) })
  })

  it('rejects a truncated download (received bytes ≠ Content-Length)', async () => {
    // Server promises the full image size but the body arrives short — exactly
    // the partial-download failure that produced truncated hero images.
    const fetchImpl = scriptedFetch([
      () =>
        imageResponse(TRUNCATED_PNG, { 'content-length': String(VALID_PNG.byteLength) }),
    ])
    const client = createGwjClient(baseOptions({ fetch: fetchImpl }))
    await expect(
      client.uploadImage({ url: 'https://cdn.example.com/x.png', filename: 'x.png' }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/truncated download/i) })
  })

  it('rejects a structurally corrupt image even when fully downloaded', async () => {
    // Content-Length matches the (short) body, so the truncation check passes,
    // but the bytes are not a complete PNG → the structural validator rejects it.
    const fetchImpl = scriptedFetch([() => imageResponse(TRUNCATED_PNG)])
    const client = createGwjClient(baseOptions({ fetch: fetchImpl }))
    await expect(
      client.uploadImage({ url: 'https://cdn.example.com/x.png', filename: 'x.png' }),
    ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/not usable/i) })
  })

  it('uploads a valid public image and returns the CDN url', async () => {
    const fetchImpl = scriptedFetch([
      () => imageResponse(VALID_PNG),
      () => loginResponse(),
      (url, init) => {
        expect(url).toBe('https://api.example.com/api/admin/upload')
        expect(init?.method).toBe('POST')
        return uploadResponse()
      },
    ])
    const client = createGwjClient(baseOptions({ fetch: fetchImpl }))
    const result = await client.uploadImage({
      url: 'https://cdn.example.com/x.png',
      filename: 'x.png',
      alt: 'a photo',
    })
    expect(result.url).toBe('https://cdn.example.com/articles/abc-hero.jpg')
  })

  it('uploads from base64 without any DNS resolution', async () => {
    const fetchImpl = scriptedFetch([
      () => loginResponse(),
      (url) => {
        expect(url).toBe('https://api.example.com/api/admin/upload')
        return uploadResponse()
      },
    ])
    const client = createGwjClient(
      baseOptions({
        fetch: fetchImpl,
        resolveDns: async () => {
          throw new Error('DNS must not be used for base64 uploads')
        },
      }),
    )
    const png = Buffer.from(VALID_PNG).toString('base64')
    const result = await client.uploadImage({ base64: png, filename: 'x.png' })
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
    const fetchImpl = scriptedFetch([() => loginResponse()])
    const client = createGwjClient(baseOptions({ fetch: fetchImpl }))
    await expect(client.uploadImage({ filename: 'x.png' })).rejects.toBeInstanceOf(BackendError)
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
