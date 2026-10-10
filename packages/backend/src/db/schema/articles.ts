import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import {
  ArticleStatusSchema,
  CATEGORIES,
  SUPPORTED_LANGUAGES,
  type ArticleStatus,
  type Category,
  type HeroImage,
  type Language,
  type Seo,
  type Source,
} from '@gwj/shared-types';
import { RECORD_ID_SQL_PATTERN } from '../ids';
import { sqlInList } from '../sqlLiterals';

const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

/**
 * Full-text search vector over `title` + `deck` — the exact fields of the Mongo
 * text index it replaces (`{ title: 'text', deck: 'text' }`, equal weights).
 *
 * The text-search configuration is chosen PER ROW from `language`, because the
 * Mongo index did the same thing implicitly: a text index's `language_override`
 * defaults to the document's `language` field, so an `es` article was stemmed as
 * Spanish and an `fr` one as French. Queries are parsed with `english`, the index's
 * `default_language` (see `articleRepository.searchCondition`).
 */
export const ARTICLE_SEARCH_VECTOR_SQL = sql`to_tsvector(
  CASE "language" WHEN 'es' THEN 'spanish'::regconfig WHEN 'fr' THEN 'french'::regconfig ELSE 'english'::regconfig END,
  coalesce("title", '') || ' ' || coalesce("deck", '')
)`;

export const articles = pgTable(
  'articles',
  {
    /** 24-hex id; see `ids.ts` for why it keeps the ObjectId shape. */
    id: text().primaryKey(),
    slug: text().notNull(),
    title: text().notNull(),
    deck: text(),
    kicker: text(),
    category: text().$type<Category>().notNull(),
    language: text().$type<Language>().notNull().default('en'),
    author: text().notNull(),
    /** Markdown (GFM), rendered on the client. Validated by `ArticleInputSchema`. */
    body: text().notNull(),
    heroImage: jsonb().$type<HeroImage>(),
    status: text().$type<ArticleStatus>().notNull().default('draft'),
    featured: integer().notNull().default(0),
    tags: text().array().notNull().default(sql`'{}'::text[]`),
    seo: jsonb().$type<Seo>().notNull().default(sql`'{}'::jsonb`),
    /** Internal provenance (never shown to readers). */
    source: jsonb().$type<Source>(),
    publishedAt: timestamp({ withTimezone: true, mode: 'date' }),
    /**
     * When the article first went live. Never cleared (unpublish only clears
     * `publishedAt`), so it freezes the slug and makes the publish fan-out
     * (fediverse, Telegram) fire exactly once per article.
     */
    firstPublishedAt: timestamp({ withTimezone: true, mode: 'date' }),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    searchVector: tsvector().generatedAlwaysAs(ARTICLE_SEARCH_VECTOR_SQL),
  },
  (t) => [
    // A FOREIGN KEY never targets articles, but `unique()` (a constraint) rather
    // than `uniqueIndex()` keeps the constraint name stable for 23505 handling.
    unique('articles_slug_unique').on(t.slug),
    check('articles_id_format', sql`${t.id} ~ ${sql.raw(`'${RECORD_ID_SQL_PATTERN}'`)}`),
    check('articles_status_check', sql`${t.status} IN ${sqlInList(ArticleStatusSchema.options)}`),
    check('articles_category_check', sql`${t.category} IN ${sqlInList(CATEGORIES)}`),
    check('articles_language_check', sql`${t.language} IN ${sqlInList(SUPPORTED_LANGUAGES)}`),
    // Mongoose `min: 0`, which ran on every save() — the only article write path.
    check('articles_featured_check', sql`${t.featured} >= 0`),
    // Every writer (create, update, publish, unpublish) stamps publishedAt exactly
    // when the article is published and clears it on the way back to draft; the
    // production census found 0 rows violating it in either direction.
    check(
      'articles_published_at_check',
      sql`(${t.status} = 'published') = (${t.publishedAt} IS NOT NULL)`,
    ),
    // The four Mongo indexes, ported one-for-one (publishedAt DESC with NULLS LAST,
    // which is where Mongo's descending order puts a null).
    index('articles_status_published_at_idx').on(t.status, t.publishedAt.desc().nullsLast()),
    index('articles_language_status_published_at_idx').on(
      t.language,
      t.status,
      t.publishedAt.desc().nullsLast(),
    ),
    index('articles_category_published_at_idx').on(t.category, t.publishedAt.desc().nullsLast()),
    index('articles_search_vector_idx').using('gin', t.searchVector),
  ],
);

export type ArticleRow = typeof articles.$inferSelect;
export type NewArticleRow = typeof articles.$inferInsert;
