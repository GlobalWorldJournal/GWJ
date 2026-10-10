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
} from '@gwj/shared-types';
import { validateImageBuffer } from '@gwj/shared-types/image-validation';
import { z } from 'zod';

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

export interface GwjClientOptions {
  apiBaseUrl: string;
  adminUsername: string;
  adminPassword: string;
  /** Injectable for testing; defaults to the global `fetch`. */
  fetch?: typeof fetch;
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
}

export interface UploadImageInput {
  filename: string;
  base64?: string;
  url?: string;
}

export function createGwjClient(options: GwjClientOptions): GwjClient {
  const baseUrl = options.apiBaseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetch ?? fetch;
  let token: string | null = null;

  async function login(): Promise<string> {
    const response = await fetchImpl(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: options.adminUsername,
        password: options.adminPassword,
      }),
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
   * Perform an authenticated request, re-logging in once on a 401 and retrying.
   * Returns the raw Response (caller decides how to read the body).
   */
  async function authedRequestRaw(path: string, init: RequestInit = {}): Promise<Response> {
    const send = async (bearer: string): Promise<Response> => {
      const headers = new Headers(init.headers);
      headers.set('authorization', `Bearer ${bearer}`);
      return fetchImpl(`${baseUrl}${path}`, { ...init, headers });
    };

    let response = await send(await authToken());
    if (response.status === 401) {
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
