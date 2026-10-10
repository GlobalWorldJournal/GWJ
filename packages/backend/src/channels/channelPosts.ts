import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { articleChannelPosts, type ArticleChannelPostRow } from '../db/schema/articleChannelPosts';

/**
 * Record (or update) that `channel` successfully delivered `articleId`, with
 * `ref` carrying whatever that channel needs to retract it later. `ON CONFLICT`
 * on the one (articleId, channel) a delivery can ever hold, not catch-and-reread
 * — the same idempotent-insert discipline the rest of the backend uses.
 */
export async function recordChannelPost(
  articleId: string,
  channel: string,
  ref: Record<string, unknown>,
): Promise<void> {
  await getDb()
    .insert(articleChannelPosts)
    .values({ articleId, channel, ref })
    .onConflictDoUpdate({
      target: [articleChannelPosts.articleId, articleChannelPosts.channel],
      set: { ref },
    });
}

/** Every channel delivery recorded for one article (used to fan out a retraction). */
export async function channelPostsFor(articleId: string): Promise<ArticleChannelPostRow[]> {
  return getDb()
    .select()
    .from(articleChannelPosts)
    .where(eq(articleChannelPosts.articleId, articleId));
}

/** Drop one article's recorded deliveries once retraction has been attempted. */
export async function removeChannelPosts(articleId: string): Promise<void> {
  await getDb().delete(articleChannelPosts).where(eq(articleChannelPosts.articleId, articleId));
}
