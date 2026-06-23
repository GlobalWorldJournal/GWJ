import { z } from 'zod'
import { CategorySchema } from './category'
import { LanguageSchema } from './language'
import { ArticleSchema, ArticleStatusSchema } from './article'

export const LoginInputSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})
export type LoginInput = z.infer<typeof LoginInputSchema>

export const LoginResponseSchema = z.object({
  token: z.string(),
  user: z.object({ username: z.string(), role: z.literal('admin') }),
})
export type LoginResponse = z.infer<typeof LoginResponseSchema>

/** Query params for listing articles (coerced from strings). */
export const ArticleListQuerySchema = z.object({
  category: CategorySchema.optional(),
  language: LanguageSchema.optional(),
  featured: z.coerce.boolean().optional(),
  status: ArticleStatusSchema.optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
export type ArticleListQuery = z.infer<typeof ArticleListQuerySchema>

export const PaginationSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
})
export type Pagination = z.infer<typeof PaginationSchema>

export const PaginatedArticlesSchema = z.object({
  data: z.array(ArticleSchema),
  pagination: PaginationSchema,
})
export type PaginatedArticles = z.infer<typeof PaginatedArticlesSchema>

export const UploadResponseSchema = z.object({ url: z.string().url() })
export type UploadResponse = z.infer<typeof UploadResponseSchema>

export const ApiErrorSchema = z.object({
  error: z.string(),
  details: z.unknown().optional(),
})
export type ApiError = z.infer<typeof ApiErrorSchema>
