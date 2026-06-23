import { z } from 'zod'
import { CategorySchema } from './category'

/** Ordered content blocks that make up an article body. */
export const ContentBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paragraph'), text: z.string().min(1) }),
  z.object({ type: z.literal('heading'), text: z.string().min(1) }),
  z.object({
    type: z.literal('image'),
    url: z.string().url(),
    caption: z.string().optional(),
    credit: z.string().optional(),
    alt: z.string().default(''),
  }),
  z.object({ type: z.literal('quote'), text: z.string().min(1), attribution: z.string().optional() }),
  z.object({
    type: z.literal('list'),
    ordered: z.boolean().default(false),
    items: z.array(z.string().min(1)).min(1),
  }),
])
export type ContentBlock = z.infer<typeof ContentBlockSchema>

export const ArticleStatusSchema = z.enum(['draft', 'published'])
export type ArticleStatus = z.infer<typeof ArticleStatusSchema>

export const HeroImageSchema = z.object({
  url: z.string().url(),
  caption: z.string().optional(),
  credit: z.string().optional(),
  alt: z.string().default(''),
})
export type HeroImage = z.infer<typeof HeroImageSchema>

export const SeoSchema = z
  .object({
    metaTitle: z.string().optional(),
    metaDescription: z.string().optional(),
    ogImage: z.string().url().optional(),
  })
  .default({})
export type Seo = z.infer<typeof SeoSchema>

/** Payload to create an article. */
export const ArticleInputSchema = z.object({
  title: z.string().min(1),
  deck: z.string().optional(),
  kicker: z.string().optional(),
  category: CategorySchema,
  author: z.string().min(1),
  // Article body is stored as Markdown (GitHub-flavored), rendered to HTML on
  // the client. The legacy ContentBlock union remains exported for reference
  // but is no longer the storage format.
  body: z.string().min(1),
  heroImage: HeroImageSchema.optional(),
  status: ArticleStatusSchema.default('draft'),
  featured: z.number().int().min(0).default(0),
  tags: z.array(z.string()).default([]),
  seo: SeoSchema,
})
export type ArticleInput = z.infer<typeof ArticleInputSchema>

/** Partial payload to update an article. */
export const ArticleUpdateSchema = ArticleInputSchema.partial()
export type ArticleUpdate = z.infer<typeof ArticleUpdateSchema>

/** Full article DTO returned by the API (dates as ISO strings, `id` not `_id`). */
export const ArticleSchema = ArticleInputSchema.extend({
  id: z.string(),
  slug: z.string(),
  publishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Article = z.infer<typeof ArticleSchema>

/**
 * Convert a title into a URL-safe slug.
 * Lowercases, strips diacritics, drops non-alphanumerics, collapses dashes.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}
