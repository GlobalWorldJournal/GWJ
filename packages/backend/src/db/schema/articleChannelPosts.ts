import { bigint, index, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

/**
 * One row per article successfully delivered to one distribution channel
 * (`channel`, e.g. `"telegram:en"` — a {@link import('../../channels/types').PublishChannel}'s
 * `name`). Recorded so a later retraction (the article is unpublished or deleted)
 * can find and remove the right destination post.
 *
 * `ref` is opaque, channel-specific retraction data — Telegram stores
 * `{ chatId, messageId }`, the two fields `deleteMessage` needs. A channel that
 * can't retract (Mastodon, WhatsApp today) never gets a row here at all.
 *
 * Deliberately NO foreign key to `articles`, same reasoning as
 * `takedown_requests`: the registry looks these rows up and retracts them BEFORE
 * an article delete completes (`services/articleService.ts`'s `remove`), not via
 * a DB-level cascade — a cascade would remove the bookkeeping before the
 * application ever got to call Telegram's API.
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
