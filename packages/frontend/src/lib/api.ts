import { z } from 'zod';
import {
  ActiveAdResponseSchema,
  AdCampaignSchema,
  PaginatedAdCampaignsSchema,
  ArticleRevisionSummarySchema,
  ArticleSchema,
  PaginatedArticlesSchema,
  PaginatedPublicArticlesSchema,
  PopularArticlesSchema,
  PublicArticleSchema,
  CategoryDocSchema,
  LoginResponseSchema,
  UploadResponseSchema,
  ApiErrorSchema,
  TakedownRequestSchema,
  ApiTokenSchema,
  CreatedApiTokenSchema,
  UserSchema,
  PaginatedTakedownRequestsSchema,
  type Article,
  type ArticleRevisionSummary,
  type PaginatedArticles,
  type PaginatedPublicArticles,
  type PopularArticles,
  type PublicArticle,
  type CategoryDoc,
  type LoginResponse,
  type UploadResponse,
  type ArticleInput,
  type ArticleUpdate,
  type Category,
  type ArticleStatus,
  type Language,
  type TakedownRequestInput,
  type TakedownRequestRecord,
  type PaginatedTakedownRequests,
  type TakedownAction,
  type ApiToken,
  type CreateApiTokenInput,
  type CreatedApiToken,
  type ChangePasswordInput,
  type CreateUserInput,
  type UpdateUserInput,
  type User,
  type TakedownStatus,
  type ActiveAdResponse,
  type AdCampaign,
  type AdCampaignInput,
  type AdCampaignStatus,
  type AdCampaignUpdate,
  type AdVariant,
  type PaginatedAdCampaigns,
} from '@gwj/shared-types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

/** Error thrown when the server responds with a non-2xx status. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.details = details;
  }
}

/** Error thrown when a 2xx response does not match the expected schema (contract drift). */
export class ApiContractError extends Error {
  readonly issues: z.ZodIssue[];

  constructor(path: string, issues: z.ZodIssue[]) {
    super(`API contract drift at ${path}: response did not match the expected schema`);
    this.name = 'ApiContractError';
    this.issues = issues;
  }
}

function buildUrl(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): string {
  const url = new URL(`${API_BASE_URL}${path}`, API_BASE_URL || window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function readError(response: Response): Promise<ApiRequestError> {
  let message = response.statusText || 'Request failed';
  let details: unknown;
  try {
    const body: unknown = await response.json();
    const parsed = ApiErrorSchema.safeParse(body);
    if (parsed.success) {
      message = parsed.data.error;
      details = parsed.data.details;
    }
  } catch {
    // Non-JSON error body — keep the status text as the message.
    message = response.statusText || message;
  }
  return new ApiRequestError(response.status, message, details);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

async function request<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  options: RequestOptions = {},
): Promise<z.output<S>> {
  const { method = 'GET', body, token, params, signal } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(buildUrl(path, params), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw await readError(response);
  }

  const payload: unknown = await response.json();
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiContractError(path, parsed.error.issues);
  }
  return parsed.data;
}

export interface ArticlesQuery {
  category?: Category;
  language?: Language;
  featured?: boolean;
  /** Only stories carrying this exact tag. */
  tag?: string;
  /** Only stories by this exact byline. */
  author?: string;
  /** `latest`: newest first instead of the front-page (featured) order. */
  sort?: 'editorial' | 'latest';
  page?: number;
  limit?: number;
}

export function getArticles(
  query: ArticlesQuery = {},
  signal?: AbortSignal,
): Promise<PaginatedPublicArticles> {
  return request('/api/articles', PaginatedPublicArticlesSchema, {
    params: {
      category: query.category,
      language: query.language,
      featured: query.featured,
      tag: query.tag,
      author: query.author,
      sort: query.sort,
      page: query.page,
      limit: query.limit,
    },
    signal,
  });
}

export function getArticle(slug: string, signal?: AbortSignal): Promise<PublicArticle> {
  return request(`/api/articles/${encodeURIComponent(slug)}`, PublicArticleSchema, { signal });
}

/** An edition's most read stories over the last couple of days, most read first. */
export function getPopularArticles(
  language: Language,
  limit: number,
  signal?: AbortSignal,
): Promise<PopularArticles> {
  return request('/api/articles/popular', PopularArticlesSchema, {
    params: { language, limit },
    signal,
  });
}

/**
 * Tell the paper a reader opened an article, for Most Popular. A beacon: it
 * never delays the page, survives navigating away, and carries nothing about
 * the reader. A view that fails to send is simply not counted.
 */
export function reportArticleView(articleId: string): void {
  const url = buildUrl(`/api/articles/${encodeURIComponent(articleId)}/view`);
  if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(url)) return;
  fetch(url, { method: 'POST', keepalive: true }).catch(() => undefined);
}

export function getCategories(signal?: AbortSignal): Promise<CategoryDoc[]> {
  return request('/api/categories', z.array(CategoryDocSchema), { signal });
}

export function searchArticles(
  q: string,
  page = 1,
  language?: Language,
  signal?: AbortSignal,
): Promise<PaginatedPublicArticles> {
  return request('/api/search', PaginatedPublicArticlesSchema, {
    params: { q, page, language },
    signal,
  });
}

export function login(username: string, password: string): Promise<LoginResponse> {
  return request('/api/auth/login', LoginResponseSchema, {
    method: 'POST',
    body: { username, password },
  });
}

export interface AdminArticlesQuery {
  status?: ArticleStatus;
  category?: Category;
  language?: Language;
  /** Free text over headline, deck and body. */
  q?: string;
  sort?: 'editorial' | 'latest';
  page?: number;
  limit?: number;
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
      language: query.language,
      q: query.q,
      sort: query.sort,
      page: query.page,
      limit: query.limit,
    },
    signal,
  });
}

/** One article by id, drafts included (admin). */
export function getAdminArticle(token: string, id: string, signal?: AbortSignal): Promise<Article> {
  return request(`/api/admin/articles/${encodeURIComponent(id)}`, ArticleSchema, { token, signal });
}

/** An article's history, newest first (each entry is the state before one change). */
export function getArticleRevisions(
  token: string,
  id: string,
  signal?: AbortSignal,
): Promise<ArticleRevisionSummary[]> {
  return request(
    `/api/admin/articles/${encodeURIComponent(id)}/revisions`,
    z.array(ArticleRevisionSummarySchema),
    { token, signal },
  );
}

/** Roll the article's content back to a revision; returns the restored article. */
export function restoreArticleRevision(
  token: string,
  id: string,
  revisionId: number,
): Promise<Article> {
  return request(
    `/api/admin/articles/${encodeURIComponent(id)}/revisions/${revisionId}/restore`,
    ArticleSchema,
    { method: 'POST', token },
  );
}

/** Append a dated public correction; returns the corrected article. */
export function addArticleCorrection(token: string, id: string, text: string): Promise<Article> {
  return request(`/api/admin/articles/${encodeURIComponent(id)}/corrections`, ArticleSchema, {
    method: 'POST',
    body: { text },
    token,
  });
}

export function createArticle(token: string, input: ArticleInput): Promise<Article> {
  return request('/api/admin/articles', ArticleSchema, { method: 'POST', body: input, token });
}

export function updateArticle(token: string, id: string, patch: ArticleUpdate): Promise<Article> {
  return request(`/api/admin/articles/${encodeURIComponent(id)}`, ArticleSchema, {
    method: 'PATCH',
    body: patch,
    token,
  });
}

export function deleteArticle(token: string, id: string): Promise<{ ok: true }> {
  return request(
    `/api/admin/articles/${encodeURIComponent(id)}`,
    z.object({ ok: z.literal(true) }),
    { method: 'DELETE', token },
  );
}

export function publishArticle(token: string, id: string): Promise<Article> {
  return request(`/api/admin/articles/${encodeURIComponent(id)}/publish`, ArticleSchema, {
    method: 'POST',
    token,
  });
}

export function unpublishArticle(token: string, id: string): Promise<Article> {
  return request(`/api/admin/articles/${encodeURIComponent(id)}/unpublish`, ArticleSchema, {
    method: 'POST',
    token,
  });
}

async function uploadFile(
  path: string,
  token: string,
  file: File,
  fields: Record<string, string> = {},
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  for (const [key, value] of Object.entries(fields)) formData.append(key, value);

  const response = await fetch(buildUrl(path), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!response.ok) {
    throw await readError(response);
  }

  const payload: unknown = await response.json();
  const parsed = UploadResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiContractError(path, parsed.error.issues);
  }
  return parsed.data;
}

export function uploadImage(token: string, file: File): Promise<UploadResponse> {
  return uploadFile('/api/admin/upload', token, file);
}

/** Public submission; the server deliberately echoes back only `{ id, status }`, never the full record. */
export function submitTakedownRequest(
  input: TakedownRequestInput,
): Promise<{ id: string; status: TakedownStatus }> {
  return request(
    '/api/takedown-requests',
    z.object({ id: z.string(), status: z.custom<TakedownStatus>() }),
    {
      method: 'POST',
      body: input,
    },
  );
}

export interface AdminTakedownRequestsQuery {
  status?: TakedownStatus;
  page?: number;
  limit?: number;
}

export function getAdminTakedownRequests(
  token: string,
  query: AdminTakedownRequestsQuery = {},
  signal?: AbortSignal,
): Promise<PaginatedTakedownRequests> {
  return request('/api/admin/takedown-requests', PaginatedTakedownRequestsSchema, {
    token,
    params: { status: query.status, page: query.page, limit: query.limit },
    signal,
  });
}

export function actionTakedownRequest(
  token: string,
  id: string,
  action: TakedownAction,
): Promise<TakedownRequestRecord> {
  return request(
    `/api/admin/takedown-requests/${encodeURIComponent(id)}/action`,
    TakedownRequestSchema,
    {
      method: 'POST',
      body: action,
      token,
    },
  );
}

/** The directly sold campaign filling this slot right now; `campaign: null` means AdSense. */
export function getActiveAdCampaign(
  variant: AdVariant,
  signal?: AbortSignal,
): Promise<ActiveAdResponse> {
  return request('/api/ad-campaigns/active', ActiveAdResponseSchema, {
    params: { variant },
    signal,
  });
}

export interface AdminAdCampaignsQuery {
  status?: AdCampaignStatus;
  page?: number;
  limit?: number;
}

export function getAdminAdCampaigns(
  token: string,
  query: AdminAdCampaignsQuery = {},
  signal?: AbortSignal,
): Promise<PaginatedAdCampaigns> {
  return request('/api/admin/ad-campaigns', PaginatedAdCampaignsSchema, {
    token,
    params: { status: query.status, page: query.page, limit: query.limit },
    signal,
  });
}

export function createAdCampaign(token: string, input: AdCampaignInput): Promise<AdCampaign> {
  return request('/api/admin/ad-campaigns', AdCampaignSchema, {
    method: 'POST',
    body: input,
    token,
  });
}

export function updateAdCampaign(
  token: string,
  id: string,
  patch: AdCampaignUpdate,
): Promise<AdCampaign> {
  return request(`/api/admin/ad-campaigns/${encodeURIComponent(id)}`, AdCampaignSchema, {
    method: 'PATCH',
    body: patch,
    token,
  });
}

/** Permanently delete a campaign (the server answers 204 No Content). */
export async function deleteAdCampaign(token: string, id: string): Promise<void> {
  const response = await fetch(buildUrl(`/api/admin/ad-campaigns/${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw await readError(response);
  }
}

/**
 * Upload a creative through the S3/CDN pipeline with the banner-sized floor.
 * `variant` lets the server also check the image is the right SHAPE for that
 * slot (leaderboard/mrec), not just big enough — see `AD_CREATIVE_ASPECT_RATIOS`.
 */
export function uploadAdCreative(
  token: string,
  file: File,
  variant: AdVariant,
): Promise<UploadResponse> {
  return uploadFile('/api/admin/ad-campaigns/creative', token, file, { variant });
}

/**
 * Starts (or restarts, e.g. after a genuine revocation) the one-time Mention
 * authorization: the returned `url` must be opened signed in as @gwj on
 * Mention, approved there, and only then does the grant exist — this call
 * alone does not connect anything.
 */
export function beginMentionAuthorization(token: string): Promise<{ url: string }> {
  return request('/api/admin/mention/connect', z.object({ url: z.string() }), { token });
}

/** Agent API tokens (admin users only): listed without their secrets. */
export function getApiTokens(token: string, signal?: AbortSignal): Promise<ApiToken[]> {
  return request('/api/admin/tokens', z.array(ApiTokenSchema), { token, signal });
}

/** Mint an agent token. The response carries the secret — the only time it is shown. */
export function createApiToken(
  token: string,
  input: CreateApiTokenInput,
): Promise<CreatedApiToken> {
  return request('/api/admin/tokens', CreatedApiTokenSchema, {
    method: 'POST',
    token,
    body: input,
  });
}

export function revokeApiToken(token: string, id: string): Promise<ApiToken> {
  return request(`/api/admin/tokens/${encodeURIComponent(id)}/revoke`, ApiTokenSchema, {
    method: 'POST',
    token,
  });
}

/** The newsroom's accounts (admins only). */
export function getUsers(token: string, signal?: AbortSignal): Promise<User[]> {
  return request('/api/admin/users', z.array(UserSchema), { token, signal });
}

export function createUser(token: string, input: CreateUserInput): Promise<User> {
  return request('/api/admin/users', UserSchema, { method: 'POST', token, body: input });
}

/** Change someone's role, or deactivate / reactivate them (admins only). */
export function updateUser(token: string, id: string, input: UpdateUserInput): Promise<User> {
  return request(`/api/admin/users/${encodeURIComponent(id)}`, UserSchema, {
    method: 'PATCH',
    token,
    body: input,
  });
}

/** Change the signed-in person's own password. */
export async function changePassword(token: string, input: ChangePasswordInput): Promise<void> {
  const response = await fetch(buildUrl('/api/admin/account/password'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await readError(response);
}
