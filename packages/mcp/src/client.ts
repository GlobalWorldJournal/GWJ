import {
  ArticleListQuerySchema,
  ArticleSchema,
  CategoryDocSchema,
  LoginResponseSchema,
  PaginatedArticlesSchema,
  UploadResponseSchema,
  type Article,
  type ArticleInput,
  type ArticleListQuery,
  type ArticleUpdate,
  type CategoryDoc,
  type PaginatedArticles,
  type UploadResponse,
} from '@gwj/shared-types'
import { z } from 'zod'
import { assertSafeRemoteUrl, type AssertSafeRemoteUrlOptions } from './ssrfGuard.js'

/** Maximum size (bytes) for an image fetched from a remote URL. */
const MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024

/** Thrown when the backend returns a non-2xx response. */
export class BackendError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'BackendError'
  }
}

export interface GwjClientOptions {
  apiBaseUrl: string
  adminUsername: string
  adminPassword: string
  /** Injectable for testing; defaults to the global `fetch`. */
  fetch?: typeof fetch
  /** Injectable DNS resolver for the SSRF guard; defaults to node:dns/promises. */
  resolveDns?: AssertSafeRemoteUrlOptions['resolve']
}

/** A typed client to the GWJ backend admin API. */
export interface GwjClient {
  listArticles(query: Partial<ArticleListQuery>): Promise<PaginatedArticles>
  getArticle(ref: { slug?: string; id?: string }): Promise<Article>
  createArticle(input: ArticleInput): Promise<Article>
  updateArticle(id: string, patch: ArticleUpdate): Promise<Article>
  publishArticle(id: string): Promise<Article>
  unpublishArticle(id: string): Promise<Article>
  deleteArticle(id: string): Promise<{ deleted: true; id: string }>
  uploadImage(input: UploadImageInput): Promise<UploadResponse>
  listCategories(): Promise<CategoryDoc[]>
}

export interface UploadImageInput {
  filename: string
  alt?: string
  base64?: string
  url?: string
}

/** Guess a content type from a filename extension for multipart uploads. */
function contentTypeFromFilename(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase()
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'avif':
      return 'image/avif'
    case 'svg':
      return 'image/svg+xml'
    default:
      return 'application/octet-stream'
  }
}

export function createGwjClient(options: GwjClientOptions): GwjClient {
  const baseUrl = options.apiBaseUrl.replace(/\/+$/, '')
  const fetchImpl = options.fetch ?? fetch
  const resolveDns = options.resolveDns
  let token: string | null = null

  async function login(): Promise<string> {
    const response = await fetchImpl(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: options.adminUsername,
        password: options.adminPassword,
      }),
    })
    const payload = await readJson(response)
    if (!response.ok) {
      throw new BackendError(extractError(payload, 'Admin login failed'), response.status, payload)
    }
    const parsed = LoginResponseSchema.parse(payload)
    token = parsed.token
    return parsed.token
  }

  async function authToken(): Promise<string> {
    return token ?? (await login())
  }

  /**
   * Perform an authenticated request, re-logging in once on a 401 and retrying.
   * Returns the raw Response (caller decides how to read the body).
   */
  async function authedRequestRaw(path: string, init: RequestInit = {}): Promise<Response> {
    const send = async (bearer: string): Promise<Response> => {
      const headers = new Headers(init.headers)
      headers.set('authorization', `Bearer ${bearer}`)
      return fetchImpl(`${baseUrl}${path}`, { ...init, headers })
    }

    let response = await send(await authToken())
    if (response.status === 401) {
      token = null
      response = await send(await login())
    }
    return response
  }

  /**
   * Perform an authenticated request and return the parsed JSON body of a
   * successful (2xx) response; throw a BackendError otherwise.
   */
  async function authedRequest(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await authedRequestRaw(path, init)
    const payload = await readJson(response)
    if (!response.ok) {
      throw new BackendError(
        extractError(payload, `Backend request failed (${path})`),
        response.status,
        payload,
      )
    }
    return payload
  }

  async function publicRequest(path: string): Promise<unknown> {
    const response = await fetchImpl(`${baseUrl}${path}`)
    const payload = await readJson(response)
    if (!response.ok) {
      throw new BackendError(
        extractError(payload, `Backend request failed (${path})`),
        response.status,
        payload,
      )
    }
    return payload
  }

  return {
    async listArticles(query) {
      const parsedQuery = ArticleListQuerySchema.parse(query)
      const search = new URLSearchParams()
      if (parsedQuery.category) search.set('category', parsedQuery.category)
      if (parsedQuery.status) search.set('status', parsedQuery.status)
      if (parsedQuery.featured !== undefined) search.set('featured', String(parsedQuery.featured))
      if (parsedQuery.q) search.set('q', parsedQuery.q)
      search.set('page', String(parsedQuery.page))
      search.set('limit', String(parsedQuery.limit))
      const payload = await authedRequest(`/api/admin/articles?${search.toString()}`)
      return PaginatedArticlesSchema.parse(payload)
    },

    async getArticle(ref) {
      if (!ref.id && !ref.slug) {
        throw new BackendError('get_article requires either `id` or `slug`', 400)
      }
      const path = ref.id
        ? `/api/admin/articles/${encodeURIComponent(ref.id)}`
        : `/api/admin/articles/by-slug/${encodeURIComponent(ref.slug ?? '')}`
      const payload = await authedRequest(path)
      return ArticleSchema.parse(payload)
    },

    async createArticle(input) {
      const payload = await authedRequest('/api/admin/articles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      })
      return ArticleSchema.parse(payload)
    },

    async updateArticle(id, patch) {
      const payload = await authedRequest(`/api/admin/articles/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      return ArticleSchema.parse(payload)
    },

    async publishArticle(id) {
      const payload = await authedRequest(
        `/api/admin/articles/${encodeURIComponent(id)}/publish`,
        { method: 'POST' },
      )
      return ArticleSchema.parse(payload)
    },

    async unpublishArticle(id) {
      const payload = await authedRequest(
        `/api/admin/articles/${encodeURIComponent(id)}/unpublish`,
        { method: 'POST' },
      )
      return ArticleSchema.parse(payload)
    },

    async deleteArticle(id) {
      // Backend responds 204 No Content; treat any 2xx as success (no body to parse).
      const response = await authedRequestRaw(`/api/admin/articles/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const payload = await readJson(response)
        throw new BackendError(
          extractError(payload, `Failed to delete article ${id}`),
          response.status,
          payload,
        )
      }
      return { deleted: true, id }
    },

    async uploadImage(input) {
      const bytes = await resolveImageBytes(input, fetchImpl, resolveDns)
      const form = new FormData()
      form.set(
        'file',
        new Blob([bytes], { type: contentTypeFromFilename(input.filename) }),
        input.filename,
      )
      if (input.alt) form.set('alt', input.alt)
      const payload = await authedRequest('/api/admin/upload', { method: 'POST', body: form })
      return UploadResponseSchema.parse(payload)
    },

    async listCategories() {
      const payload = await publicRequest('/api/categories')
      return z.array(CategoryDocSchema).parse(payload)
    },
  }
}

/** Resolve the raw image bytes (as an ArrayBuffer) from either base64 or a remote URL. */
async function resolveImageBytes(
  input: UploadImageInput,
  fetchImpl: typeof fetch,
  resolveDns: AssertSafeRemoteUrlOptions['resolve'],
): Promise<ArrayBuffer> {
  if (input.base64) {
    const cleaned = input.base64.replace(/^data:[^;]+;base64,/, '')
    const buffer = Buffer.from(cleaned, 'base64')
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  }
  if (input.url) {
    // SSRF guard: validate scheme + resolved IP before any network egress.
    const safeUrl = await assertSafeRemoteUrl(input.url, { resolve: resolveDns })
    // Do NOT follow redirects — a 3xx to an internal host would bypass the guard.
    const response = await fetchImpl(safeUrl.toString(), { redirect: 'manual' })
    if (response.status >= 300 && response.status < 400) {
      throw new BackendError('Remote image URL responded with a redirect, which is not allowed', 400)
    }
    if (!response.ok) {
      throw new BackendError(
        `Failed to fetch image from url (${response.status})`,
        response.status,
      )
    }
    const contentType = response.headers.get('content-type') ?? ''
    if (!/^image\//i.test(contentType)) {
      throw new BackendError(
        `Remote URL did not return an image (content-type: ${contentType || 'none'})`,
        400,
      )
    }
    const declaredLength = Number(response.headers.get('content-length') ?? '')
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REMOTE_IMAGE_BYTES) {
      throw new BackendError('Remote image exceeds the 10 MB size limit', 400)
    }
    const body = await response.arrayBuffer()
    if (body.byteLength > MAX_REMOTE_IMAGE_BYTES) {
      throw new BackendError('Remote image exceeds the 10 MB size limit', 400)
    }
    return body
  }
  throw new BackendError('upload_image requires either `base64` or `url`', 400)
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function extractError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const value = (payload as { error: unknown }).error
    if (typeof value === 'string') return value
  }
  return fallback
}
