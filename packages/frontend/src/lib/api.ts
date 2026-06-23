import { z } from 'zod'
import {
  ArticleSchema,
  PaginatedArticlesSchema,
  CategoryDocSchema,
  LoginResponseSchema,
  UploadResponseSchema,
  ApiErrorSchema,
  type Article,
  type PaginatedArticles,
  type CategoryDoc,
  type LoginResponse,
  type UploadResponse,
  type ArticleInput,
  type ArticleUpdate,
  type Category,
  type ArticleStatus,
} from '@gwj/shared-types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

/** Error thrown when the server responds with a non-2xx status. */
export class ApiRequestError extends Error {
  readonly status: number
  readonly details: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.details = details
  }
}

/** Error thrown when a 2xx response does not match the expected schema (contract drift). */
export class ApiContractError extends Error {
  readonly issues: z.ZodIssue[]

  constructor(path: string, issues: z.ZodIssue[]) {
    super(`API contract drift at ${path}: response did not match the expected schema`)
    this.name = 'ApiContractError'
    this.issues = issues
  }
}

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(`${API_BASE_URL}${path}`, API_BASE_URL || window.location.origin)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value))
      }
    }
  }
  return url.toString()
}

async function readError(response: Response): Promise<ApiRequestError> {
  let message = response.statusText || 'Request failed'
  let details: unknown
  try {
    const body: unknown = await response.json()
    const parsed = ApiErrorSchema.safeParse(body)
    if (parsed.success) {
      message = parsed.data.error
      details = parsed.data.details
    }
  } catch {
    // Non-JSON error body — keep the status text as the message.
    message = response.statusText || message
  }
  return new ApiRequestError(response.status, message, details)
}

interface RequestOptions {
  method?: string
  body?: unknown
  token?: string
  params?: Record<string, string | number | boolean | undefined>
  signal?: AbortSignal
}

async function request<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  options: RequestOptions = {},
): Promise<z.output<S>> {
  const { method = 'GET', body, token, params, signal } = options
  const headers: Record<string, string> = {}
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(buildUrl(path, params), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    throw await readError(response)
  }

  const payload: unknown = await response.json()
  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    throw new ApiContractError(path, parsed.error.issues)
  }
  return parsed.data
}

export interface ArticlesQuery {
  category?: Category
  featured?: boolean
  page?: number
  limit?: number
}

export function getArticles(query: ArticlesQuery = {}, signal?: AbortSignal): Promise<PaginatedArticles> {
  return request('/api/articles', PaginatedArticlesSchema, {
    params: {
      category: query.category,
      featured: query.featured,
      page: query.page,
      limit: query.limit,
    },
    signal,
  })
}

export function getArticle(slug: string, signal?: AbortSignal): Promise<Article> {
  return request(`/api/articles/${encodeURIComponent(slug)}`, ArticleSchema, { signal })
}

export function getCategories(signal?: AbortSignal): Promise<CategoryDoc[]> {
  return request('/api/categories', z.array(CategoryDocSchema), { signal })
}

export function searchArticles(q: string, page = 1, signal?: AbortSignal): Promise<PaginatedArticles> {
  return request('/api/search', PaginatedArticlesSchema, { params: { q, page }, signal })
}

export function login(username: string, password: string): Promise<LoginResponse> {
  return request('/api/auth/login', LoginResponseSchema, {
    method: 'POST',
    body: { username, password },
  })
}

export interface AdminArticlesQuery {
  status?: ArticleStatus
  category?: Category
  page?: number
  limit?: number
}

export function getAdminArticles(
  token: string,
  query: AdminArticlesQuery = {},
  signal?: AbortSignal,
): Promise<PaginatedArticles> {
  return request('/api/admin/articles', PaginatedArticlesSchema, {
    token,
    params: {
      status: query.status,
      category: query.category,
      page: query.page,
      limit: query.limit,
    },
    signal,
  })
}

export function createArticle(token: string, input: ArticleInput): Promise<Article> {
  return request('/api/admin/articles', ArticleSchema, { method: 'POST', body: input, token })
}

export function updateArticle(token: string, id: string, patch: ArticleUpdate): Promise<Article> {
  return request(`/api/admin/articles/${encodeURIComponent(id)}`, ArticleSchema, {
    method: 'PATCH',
    body: patch,
    token,
  })
}

export function deleteArticle(token: string, id: string): Promise<{ ok: true }> {
  return request(
    `/api/admin/articles/${encodeURIComponent(id)}`,
    z.object({ ok: z.literal(true) }),
    { method: 'DELETE', token },
  )
}

export function publishArticle(token: string, id: string): Promise<Article> {
  return request(`/api/admin/articles/${encodeURIComponent(id)}/publish`, ArticleSchema, {
    method: 'POST',
    token,
  })
}

export function unpublishArticle(token: string, id: string): Promise<Article> {
  return request(`/api/admin/articles/${encodeURIComponent(id)}/unpublish`, ArticleSchema, {
    method: 'POST',
    token,
  })
}

export async function uploadImage(token: string, file: File): Promise<UploadResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(buildUrl('/api/admin/upload'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })

  if (!response.ok) {
    throw await readError(response)
  }

  const payload: unknown = await response.json()
  const parsed = UploadResponseSchema.safeParse(payload)
  if (!parsed.success) {
    throw new ApiContractError('/api/admin/upload', parsed.error.issues)
  }
  return parsed.data
}
