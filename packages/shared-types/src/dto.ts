import { z } from 'zod';
import { CategorySchema } from './category';
import { LanguageSchema } from './language';
import { ArticleSchema, ArticleStatusSchema, PublicArticleSchema } from './article';

export const LoginInputSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const LoginResponseSchema = z.object({
  token: z.string(),
  user: z.object({ username: z.string(), role: z.literal('admin') }),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

/**
 * A boolean query parameter. `z.coerce.boolean()` would read the string "false"
 * as `true` (any non-empty string is truthy), so only the literal strings
 * "true"/"false" — or a real boolean from an in-process caller — are accepted.
 */
const QueryBooleanSchema = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((value) => value === 'true'),
]);

/** Query params for listing articles (coerced from strings). */
export const ArticleListQuerySchema = z.object({
  category: CategorySchema.optional(),
  language: LanguageSchema.optional(),
  featured: QueryBooleanSchema.optional(),
  status: ArticleStatusSchema.optional(),
  /** Only articles carrying this exact tag. */
  tag: z.string().trim().min(1).optional(),
  /**
   * `editorial` (the default when absent): front-page order — featured rank, then newest.
   * `latest`: newest first, regardless of rank (feeds, sitemaps, "latest" rails).
   */
  sort: z.enum(['editorial', 'latest']).optional(),
  /** Only articles by this exact byline (see list_writers for the roster). */
  author: z.string().trim().min(1).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ArticleListQuery = z.infer<typeof ArticleListQuerySchema>;

/**
 * Query params the PUBLIC listing/search accept. No `status`: readers only ever
 * see published work, so a `?status=draft` is dropped (unknown keys are stripped).
 */
export const PublicArticleListQuerySchema = ArticleListQuerySchema.omit({ status: true });
export type PublicArticleListQuery = z.infer<typeof PublicArticleListQuerySchema>;

export const PaginationSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});
export type Pagination = z.infer<typeof PaginationSchema>;

export const PaginatedArticlesSchema = z.object({
  data: z.array(ArticleSchema),
  pagination: PaginationSchema,
});
export type PaginatedArticles = z.infer<typeof PaginatedArticlesSchema>;

/** A page of articles as the public API serves it (no internal provenance). */
export const PaginatedPublicArticlesSchema = z.object({
  data: z.array(PublicArticleSchema),
  pagination: PaginationSchema,
});
export type PaginatedPublicArticles = z.infer<typeof PaginatedPublicArticlesSchema>;

/**
 * Copy a remote image onto our CDN. The BACKEND downloads it (behind its SSRF
 * guard, timeout and size cap), validates it and stores it like an upload.
 */
export const UploadFromUrlInputSchema = z.object({
  url: z.string().url(),
  /** Name for the stored object; defaults to the URL's last path segment. */
  filename: z.string().min(1).optional(),
});
export type UploadFromUrlInput = z.infer<typeof UploadFromUrlInputSchema>;

export const UploadResponseSchema = z.object({ url: z.string().url() });
export type UploadResponse = z.infer<typeof UploadResponseSchema>;

/**
 * `/healthz` of the backend and the MCP server. `release` is the git SHA the
 * deploy stamped into the running task definition (null outside a deploy), so a
 * post-deploy check can tell the new release from a rolled-back one.
 */
export const HealthSchema = z.object({
  ok: z.literal(true),
  release: z.string().nullable(),
});
export type Health = z.infer<typeof HealthSchema>;

export const ApiErrorSchema = z.object({
  error: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
