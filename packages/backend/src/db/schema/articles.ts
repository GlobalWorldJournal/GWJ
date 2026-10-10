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
  type Correction,
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
 * The text-search configuration for each edition: an article is stemmed, and a
 * query against it parsed, in its own language.
 */
export const TEXT_SEARCH_CONFIG: Record<Language, string> = {
  en: 'english',
  es: 'spanish',
  fr: 'french',
};

const ROW_TS_CONFIG = sql.raw(
  `CASE "language" ${SUPPORTED_LANGUAGES.filter((language) => language !== 'en')
    .map((language) => `WHEN '${language}' THEN '${TEXT_SEARCH_CONFIG[language]}'::regconfig`)
    .join(' ')} ELSE 'english'::regconfig END`,
);

/**
 * Full-text search vector over the headline, deck and body, weighted so a match
 * in the headline (A) outranks one in the deck (B), which outranks one only in
 * the body (C). Each row is stemmed in its own edition's language.
 */
export const ARTICLE_SEARCH_VECTOR_SQL = sql`setweight(to_tsvector(${ROW_TS_CONFIG}, coalesce("title", '')), 'A')
  || setweight(to_tsvector(${ROW_TS_CONFIG}, coalesce("deck", '')), 'B')
  || setweight(to_tsvector(${ROW_TS_CONFIG}, coalesce("body", '')), 'C')`;

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
    /** A draft set to go live at this time (the scheduler publishes it). */
    scheduledAt: timestamp({ withTimezone: true, mode: 'date' }),
    /** Public correction notes, oldest first; appended, never rewritten. */
    corrections: jsonb().$type<Correction[]>().notNull().default(sql`'[]'::jsonb`),
    /**
     * The story this article is an edition of: every language version of one story
     * shares this id (the id of the article the group started from). An article
     * with no translations is its own group.
     */
    translationGroupId: text().notNull(),
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
    // The public feed: published articles of one edition in editorial order.
    index('articles_published_feed_idx')
      .on(t.language, t.featured.desc(), t.publishedAt.desc().nullsLast())
      .where(sql`${t.status} = 'published'`),
    // ?tag= (array containment) and ?author= listings.
    index('articles_tags_idx').using('gin', t.tags),
    index('articles_author_published_at_idx').on(t.author, t.publishedAt.desc().nullsLast()),
    // The scheduler's lookup: due drafts.
    index('articles_scheduled_at_idx').on(t.scheduledAt).where(sql`${t.scheduledAt} is not null`),
    // Only a draft can be scheduled.
    check('articles_scheduled_draft_check', sql`${t.scheduledAt} is null or ${t.status} = 'draft'`),
    // One article per language per story — and the lookup for an article's editions.
    unique('articles_translation_group_language_unique').on(t.translationGroupId, t.language),
  ],
);

export type ArticleRow = typeof articles.$inferSelect;
export type NewArticleRow = typeof articles.$inferInsert;
