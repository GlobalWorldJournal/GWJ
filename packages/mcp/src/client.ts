import {
  ArticleListQuerySchema,
  ArticleRevisionSchema,
  ArticleRevisionSummarySchema,
  ArticleSchema,
  CategoryDocSchema,
  LoginResponseSchema,
  PaginatedArticlesSchema,
  UploadResponseSchema,
  type Article,
  type ArticleInput,
  type ArticleRevision,
  type ArticleRevisionSummary,
  type ArticleListQuery,
  type ArticleUpdate,
  type CategoryDoc,
  type PaginatedArticles,
  type UploadResponse,
} from '@gwj/shared-types';
import { validateImageBuffer } from '@gwj/shared-types/image-validation';
import { z } from 'zod';

/** `fetch`'s call signature alone, so an injected double needs nothing else. */
export type FetchFn = (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>;

/** Thrown when the backend returns a non-2xx response. */
export class BackendError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'BackendError';
  }
}

/**
 * How this server authenticates to the backend: its own scoped API token
 * (preferred — the history then shows agent:<name>), or — during the move to
 * tokens — the admin username/password, exchanged for a JWT.
 */
export type BackendCredentials =
  | { kind: 'token'; token: string }
  | { kind: 'password'; username: string; password: string };

export interface GwjClientOptions {
  apiBaseUrl: string;
  credentials: BackendCredentials;
  /** Injectable for testing; defaults to the global `fetch`. */
  fetch?: FetchFn;
}

/** A typed client to the GWJ backend admin API. */
export interface GwjClient {
  listArticles(query: Partial<ArticleListQuery>): Promise<PaginatedArticles>;
  getArticle(ref: { slug?: string; id?: string }): Promise<Article>;
  createArticle(input: ArticleInput): Promise<Article>;
  updateArticle(id: string, patch: ArticleUpdate): Promise<Article>;
  publishArticle(id: string): Promise<Article>;
  unpublishArticle(id: string): Promise<Article>;
  deleteArticle(id: string): Promise<{ deleted: true; id: string }>;
  uploadImage(input: UploadImageInput): Promise<UploadResponse>;
  listCategories(): Promise<CategoryDoc[]>;
  listRevisions(id: string): Promise<ArticleRevisionSummary[]>;
  getRevision(id: string, revisionId: number): Promise<ArticleRevision>;
  restoreRevision(id: string, revisionId: number): Promise<Article>;
  addCorrection(id: string, text: string): Promise<Article>;
}

export interface UploadImageInput {
  filename: string;
  base64?: string;
  url?: string;
}

export function createGwjClient(options: GwjClientOptions): GwjClient {
  const baseUrl = options.apiBaseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetch ?? fetch;
  const credentials = options.credentials;
  let token: string | null = credentials.kind === 'token' ? credentials.token : null;

  async function login(): Promise<string> {
    if (credentials.kind === 'token') {
      throw new BackendError('The API token was refused (revoked or unknown)', 401);
    }
    const response = await fetchImpl(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: credentials.username, password: credentials.password }),
    });
    const payload = await readJson(response);
    if (!response.ok) {
      throw new BackendError(extractError(payload, 'Admin login failed'), response.status, payload);
    }
    const parsed = LoginResponseSchema.parse(payload);
    token = parsed.token;
    return parsed.token;
  }

  async function authToken(): Promise<string> {
    return token ?? (await login());
  }

  /**
   * Perform an authenticated request. With password credentials a 401 (expired
   * JWT) logs in again once and retries; an API token does not expire, so its
   * 401 is final. Returns the raw Response (caller decides how to read the body).
   */
  async function authedRequestRaw(path: string, init: RequestInit = {}): Promise<Response> {
    const send = async (bearer: string): Promise<Response> => {
      const headers = new Headers(init.headers);
      headers.set('authorization', `Bearer ${bearer}`);
      return fetchImpl(`${baseUrl}${path}`, { ...init, headers });
    };

    let response = await send(await authToken());
    if (response.status === 401 && credentials.kind === 'password') {
      token = null;
      response = await send(await login());
    }
    return response;
  }

  /**
   * Perform an authenticated request and return the parsed JSON body of a
   * successful (2xx) response; throw a BackendError otherwise.
   */
  async function authedRequest(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await authedRequestRaw(path, init);
    const payload = await readJson(response);
    if (!response.ok) {
      throw new BackendError(
        extractError(payload, `Backend request failed (${path})`),
        response.status,
        payload,
      );
    }
    return payload;
  }

  async function publicRequest(path: string): Promise<unknown> {
    const response = await fetchImpl(`${baseUrl}${path}`);
    const payload = await readJson(response);
    if (!response.ok) {
      throw new BackendError(
        extractError(payload, `Backend request failed (${path})`),
        response.status,
        payload,
      );
    }
    return payload;
  }

  return {
    async listArticles(query) {
      // Forward EVERY parsed filter, so a field added to the schema can never be
      // silently dropped here again (as `language` once was).
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(ArticleListQuerySchema.parse(query))) {
        if (value !== undefined) search.set(key, String(value));
      }
      const payload = await authedRequest(`/api/admin/articles?${search.toString()}`);
      return PaginatedArticlesSchema.parse(payload);
    },

    async getArticle(ref) {
      if (!ref.id && !ref.slug) {
        throw new BackendError('get_article requires either `id` or `slug`', 400);
      }
      const path = ref.id
        ? `/api/admin/articles/${encodeURIComponent(ref.id)}`
        : `/api/admin/articles/by-slug/${encodeURIComponent(ref.slug ?? '')}`;
      const payload = await authedRequest(path);
      return ArticleSchema.parse(payload);
    },

    async createArticle(input) {
      const payload = await authedRequest('/api/admin/articles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      return ArticleSchema.parse(payload);
    },

    async updateArticle(id, patch) {
      const payload = await authedRequest(`/api/admin/articles/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      return ArticleSchema.parse(payload);
    },

    async publishArticle(id) {
      const payload = await authedRequest(`/api/admin/articles/${encodeURIComponent(id)}/publish`, {
        method: 'POST',
      });
      return ArticleSchema.parse(payload);
    },

    async unpublishArticle(id) {
      const payload = await authedRequest(
        `/api/admin/articles/${encodeURIComponent(id)}/unpublish`,
        { method: 'POST' },
      );
      return ArticleSchema.parse(payload);
    },

    async deleteArticle(id) {
      // Backend responds 204 No Content; treat any 2xx as success (no body to parse).
      const response = await authedRequestRaw(`/api/admin/articles/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const payload = await readJson(response);
        throw new BackendError(
          extractError(payload, `Failed to delete article ${id}`),
          response.status,
          payload,
        );
      }
      return { deleted: true, id };
    },

    async uploadImage(input) {
      // A remote image is downloaded by the BACKEND, behind its SSRF guard, a
      // timeout and a streaming size cap; this service never fetches arbitrary URLs.
      if (input.url) {
        const payload = await authedRequest('/api/admin/upload/from-url', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: input.url, filename: input.filename }),
        });
        return UploadResponseSchema.parse(payload);
      }
      if (input.base64) {
        const bytes = Buffer.from(input.base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
        // Name the real format (from the bytes, not the filename) so the upload's
        // declared type matches; a bad payload fails here with the precise reason.
        const validation = validateImageBuffer(bytes);
        if (!validation.ok) {
          throw new BackendError(
            `Image is not usable (${validation.reason}): ${validation.message}`,
            422,
          );
        }
        const form = new FormData();
        form.set('file', new Blob([bytes], { type: validation.mime }), input.filename);
        const payload = await authedRequest('/api/admin/upload', { method: 'POST', body: form });
        return UploadResponseSchema.parse(payload);
      }
      throw new BackendError('upload_image requires either `url` or `base64`', 400);
    },

    async listRevisions(id) {
      const payload = await authedRequest(
        `/api/admin/articles/${encodeURIComponent(id)}/revisions`,
      );
      return z.array(ArticleRevisionSummarySchema).parse(payload);
    },

    async getRevision(id, revisionId) {
      const payload = await authedRequest(
        `/api/admin/articles/${encodeURIComponent(id)}/revisions/${revisionId}`,
      );
      return ArticleRevisionSchema.parse(payload);
    },

    async restoreRevision(id, revisionId) {
      const payload = await authedRequest(
        `/api/admin/articles/${encodeURIComponent(id)}/revisions/${revisionId}/restore`,
        { method: 'POST' },
      );
      return ArticleSchema.parse(payload);
    },

    async addCorrection(id, text) {
      const payload = await authedRequest(
        `/api/admin/articles/${encodeURIComponent(id)}/corrections`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text }),
        },
      );
      return ArticleSchema.parse(payload);
    },

    async listCategories() {
      const payload = await publicRequest('/api/categories');
      return z.array(CategoryDocSchema).parse(payload);
    },
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const value = (payload as { error: unknown }).error;
    if (typeof value === 'string') return value;
  }
  return fallback;
}
