import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { socialCardEntityId } from '../media/entities';
import { enqueueReferenceSync } from '../media/referenceJobs';
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
  await getDb().transaction(async (tx) => {
    await tx
      .insert(articleChannelPosts)
      .values({ articleId, channel, ref })
      .onConflictDoUpdate({
        target: [articleChannelPosts.articleId, articleChannelPosts.channel],
        set: { ref },
      });
    // A post may carry a file GWJ made for it (Instagram's card).
    await enqueueReferenceSync(tx, 'social_card', [socialCardEntityId(articleId, channel)]);
  });
}

/** Every channel delivery recorded for one article (used to fan out a retraction). */
export async function channelPostsFor(articleId: string): Promise<ArticleChannelPostRow[]> {
  return getDb()
    .select()
    .from(articleChannelPosts)
    .where(eq(articleChannelPosts.articleId, articleId));
}

/** The recorded delivery of one article on one channel, if any. */
export async function channelPostFor(
  articleId: string,
  channel: string,
): Promise<ArticleChannelPostRow | null> {
  const [row] = await getDb()
    .select()
    .from(articleChannelPosts)
    .where(
      and(eq(articleChannelPosts.articleId, articleId), eq(articleChannelPosts.channel, channel)),
    )
    .limit(1);
  return row ?? null;
}

/** Forget one channel's delivery of an article once it has been retracted. */
export async function removeChannelPost(articleId: string, channel: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx
      .delete(articleChannelPosts)
      .where(
        and(eq(articleChannelPosts.articleId, articleId), eq(articleChannelPosts.channel, channel)),
      );
    await enqueueReferenceSync(tx, 'social_card', [socialCardEntityId(articleId, channel)]);
  });
}
