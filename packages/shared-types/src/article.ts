import { z } from 'zod'
import { CategorySchema } from './category'
import { LanguageSchema } from './language'

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
  url: z.string().url().describe('The CDN url returned by upload_image — never a raw external url; always upload first.'),
  caption: z.string().optional().describe('Optional caption shown under the image on the article page.'),
  credit: z.string().optional().describe('Photo credit shown under the image, e.g. "Source: Reuters".'),
  alt: z.string().default('').describe('Descriptive alt text for accessibility and SEO.'),
})
export type HeroImage = z.infer<typeof HeroImageSchema>

export const SeoSchema = z
  .object({
    metaTitle: z.string().optional().describe('At most 60 characters.'),
    metaDescription: z.string().optional().describe('At most 155 characters.'),
    ogImage: z.string().url().optional().describe('Usually the same CDN url as heroImage.url.'),
  })
  .default({})
export type Seo = z.infer<typeof SeoSchema>

/**
 * Provenance for internal record-keeping (not shown to readers). Captures where
 * the story and its hero image originally came from so we can trace/attribute
 * later. `imageUrl` is the ORIGINAL image URL before we copied it to our CDN.
 */
export const SourceSchema = z.object({
  name: z.string().optional().describe('The original outlet\'s name, e.g. "Reuters".'),
  articleUrl: z.string().url().optional().describe('The original news article\'s URL, for later tracing/re-attribution.'),
  imageUrl: z.string().url().optional().describe('The ORIGINAL image URL passed to upload_image, before it was copied to our CDN.'),
})
export type Source = z.infer<typeof SourceSchema>

/** Payload to create an article. */
export const ArticleInputSchema = z.object({
  title: z.string().min(1).describe('A specific, sentence-case headline.'),
  deck: z.string().optional().describe('A one-sentence summary shown under the headline.'),
  kicker: z.string().optional().describe('A short section/topic label shown above the headline, e.g. "Markets".'),
  category: CategorySchema,
  language: LanguageSchema.default('en').describe(
    'The edition this article belongs to. Readers only see content for the edition they selected; publish the same story in another language as a separate article with that language set, not a translation field on this one.',
  ),
  author: z.string().min(1).describe('The staff writer\'s byline name — see list_writers for the roster.'),
  body: z
    .string()
    .min(1)
    .describe(
      'Clean Markdown prose only: headings, quotes, lists and images, nothing else. No HTML comments, JSON, provenance notes or any other metadata inside it — provenance belongs in `source`, image credit in `heroImage.credit`. HTML comments are stripped automatically if present, so they are silently lost rather than causing an error; put that information in the right field instead.',
    )
    .transform((s) =>
      s
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
    ),
  heroImage: HeroImageSchema.optional().describe(
    'Required in practice: every article needs one. Upload the source\'s lead photo with upload_image first and use the CDN url this returns; never a raw external image url.',
  ),
  status: ArticleStatusSchema.default('draft').describe('Normally left to create_article\'s own draft:false/true flag rather than set directly.'),
  featured: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe(
      'Manual editorial rank controlling front-page prominence (higher shows more prominently). 0 (the default) is a normal story; reserve higher numbers for stories that genuinely deserve more prominence than an ordinary day\'s news.',
    ),
  tags: z.array(z.string()).default([]).describe('3-6 relevant tags.'),
  seo: SeoSchema,
  source: SourceSchema.optional().describe(
    'Internal provenance only — never shown to readers. Record this on every article the newsroom writes from an outside source, so the story and its photo can be traced and re-attributed later.',
  ),
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
 * The article as the PUBLIC API serves it to readers: everything except the
 * internal `source` provenance, which is for the newsroom and admins only.
 */
export const PublicArticleSchema = ArticleSchema.omit({ source: true })
export type PublicArticle = z.infer<typeof PublicArticleSchema>

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
