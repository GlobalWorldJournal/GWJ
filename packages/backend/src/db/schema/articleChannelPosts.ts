import { bigint, index, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

/**
 * One row per article successfully delivered to one distribution channel
 * (`channel`, e.g. `"telegram:en"` — a {@link import('../../channels/types').PublishChannel}'s
 * `name`). Recorded so a later update or retraction (an edit, an unpublish, a
 * delete) can find the right destination post; removed once it is retracted.
 *
 * `ref` is opaque, channel-specific data — Telegram stores `{ chatId, messageId,
 * kind }`, Mastodon the delivered Note `{ noteId, author, announcer }`.
 *
 * Deliberately NO foreign key to `articles`, same reasoning as `channel_jobs`:
 * the retraction of a deleted article runs after its row is gone, and a cascade
 * would remove the bookkeeping it needs.
 */
export const articleChannelPosts = pgTable(
  'article_channel_posts',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    articleId: text().notNull(),
    channel: text().notNull(),
    ref: jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    unique('article_channel_posts_article_channel_unique').on(t.articleId, t.channel),
    index('article_channel_posts_article_id_idx').on(t.articleId),
  ],
);

export type ArticleChannelPostRow = typeof articleChannelPosts.$inferSelect;
export type NewArticleChannelPostRow = typeof articleChannelPosts.$inferInsert;
