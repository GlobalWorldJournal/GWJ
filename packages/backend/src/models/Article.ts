import { Schema, model, type HydratedDocument, type Model } from 'mongoose'
import {
  type Article,
  type ArticleStatus,
  type Category,
  type HeroImage,
  type Seo,
} from '@gwj/shared-types'

/**
 * Persistence shape of an article. Mirrors the Zod `ArticleInput` plus the
 * server-owned fields (slug, status timestamps) and the timestamps Mongoose
 * maintains via `{ timestamps: true }`.
 */
export interface ArticleAttrs {
  slug: string
  title: string
  deck?: string
  kicker?: string
  category: Category
  author: string
  body: string
  heroImage?: HeroImage
  status: ArticleStatus
  featured: number
  tags: string[]
  seo: Seo
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type ArticleDoc = HydratedDocument<ArticleAttrs>
export type ArticleModelType = Model<ArticleAttrs>

const heroImageSchema = new Schema<HeroImage>(
  {
    url: { type: String, required: true },
    caption: { type: String },
    credit: { type: String },
    alt: { type: String, default: '' },
  },
  { _id: false },
)

const seoSchema = new Schema<Seo>(
  {
    metaTitle: { type: String },
    metaDescription: { type: String },
    ogImage: { type: String },
  },
  { _id: false },
)

/**
 * The body is stored as a Markdown string (GitHub-flavored), rendered to HTML on
 * the client. The Zod `ArticleInputSchema` is the authority that validates it
 * before it ever reaches this model.
 */
const articleSchema = new Schema<ArticleAttrs, ArticleModelType>(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    deck: { type: String },
    kicker: { type: String },
    category: { type: String, required: true },
    author: { type: String, required: true },
    body: { type: String, required: true },
    heroImage: { type: heroImageSchema },
    status: { type: String, enum: ['draft', 'published'], default: 'draft', required: true },
    featured: { type: Number, default: 0, min: 0 },
    tags: { type: [String], default: [] },
    seo: { type: seoSchema, default: () => ({}) },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false },
)

articleSchema.index({ status: 1, publishedAt: -1 })
articleSchema.index({ category: 1, publishedAt: -1 })
articleSchema.index({ title: 'text', deck: 'text' })

export const ArticleModel = model<ArticleAttrs, ArticleModelType>('Article', articleSchema)

/** Map a hydrated Article document to its public DTO (`_id`→`id`, Dates→ISO). */
export function articleToDTO(doc: ArticleDoc): Article {
  const heroImage: HeroImage | undefined = doc.heroImage
    ? {
        url: doc.heroImage.url,
        caption: doc.heroImage.caption,
        credit: doc.heroImage.credit,
        alt: doc.heroImage.alt ?? '',
      }
    : undefined

  const seo: Seo = {
    metaTitle: doc.seo?.metaTitle,
    metaDescription: doc.seo?.metaDescription,
    ogImage: doc.seo?.ogImage,
  }

  return {
    id: doc._id.toString(),
    slug: doc.slug,
    title: doc.title,
    deck: doc.deck,
    kicker: doc.kicker,
    category: doc.category,
    author: doc.author,
    body: doc.body,
    heroImage,
    status: doc.status,
    featured: doc.featured,
    tags: doc.tags,
    seo,
    publishedAt: doc.publishedAt ? doc.publishedAt.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}
