import { DEFAULT_LANGUAGE, isLanguage, type Article } from '@gwj/shared-types';
import { onArticlePublished, onArticleRetracted } from '../services/articleService';
import { channelPostsFor, recordChannelPost, removeChannelPosts } from './channelPosts';
import { logger } from '../logger';
import type { PublishChannel } from './types';

/**
 * Subscribe ONCE to the article-published transition and fan every published
 * article out to all channels that are enabled AND serve the article's edition.
 *
 * Routing is language-aware: a channel handles an article only when
 * `isEnabled() && servesLanguage(article.language)`. This lets the same platform
 * run several editions (a Telegram channel per language) and lets all-editions
 * channels (Mastodon) handle every language, without per-app branching here.
 *
 * The fan-out runs each matched channel under `Promise.allSettled`, so one channel
 * throwing (or rejecting) never affects the others and never escapes the listener:
 * the article-published listener contract requires a synchronous, non-throwing
 * callback that does not block or fail the publish response, so delivery is launched
 * best-effort and its result is logged per channel. This mirrors the safe-listener
 * pattern the ActivityPub module previously used directly.
 *
 * Also subscribes to article-retracted transitions (unpublish, delete): every
 * recorded delivery for that article is looked up, retracted on whichever
 * channel implements it, then dropped from storage regardless of the outcome —
 * same "never throw, isolate per channel" discipline, and a message Telegram
 * already can't find (deleted by hand, API hiccup) is not worth retrying forever.
 *
 * Returns an unsubscribe function that removes both listeners (use it in tests
 * that build multiple app instances and at graceful shutdown).
 */
export function startChannelPublishing(channels: readonly PublishChannel[]): () => void {
  async function fanOut(article: Article): Promise<void> {
    const language = isLanguage(article.language) ? article.language : DEFAULT_LANGUAGE;
    const matched = channels.filter(
      (channel) => channel.isEnabled() && channel.servesLanguage(language),
    );
    if (matched.length === 0) return;
    // Each task owns its own logging and never rejects (errors caught here), so one
    // channel failing can't affect the others — no index correlation needed.
    await Promise.all(
      matched.map(async (channel) => {
        const meta = { channel: channel.name, platform: channel.platform, articleId: article.id };
        try {
          const ref = await channel.publish(article);
          if (ref) await recordChannelPost(article.id, channel.name, ref);
          logger.info('channel publish succeeded', meta);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error('channel publish failed', { ...meta, message });
        }
      }),
    );
  }

  async function retractAll(articleId: string): Promise<void> {
    const posts = await channelPostsFor(articleId);
    if (posts.length === 0) return;
    await Promise.all(
      posts.map(async (post) => {
        const channel = channels.find((c) => c.name === post.channel);
        const meta = { channel: post.channel, articleId };
        try {
          await channel?.retract?.(post.ref);
          logger.info('channel retract succeeded', meta);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error('channel retract failed', { ...meta, message });
        }
      }),
    );
    await removeChannelPosts(articleId);
  }

  // Both listeners are synchronous and must not throw: each launches its
  // best-effort work without awaiting it so the caller's response is never blocked.
  const unsubPublished = onArticlePublished((article) => {
    void fanOut(article).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('channel publishing error', { articleId: article.id, message });
    });
  });
  const unsubRetracted = onArticleRetracted((articleId) => {
    void retractAll(articleId).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('channel retraction error', { articleId, message });
    });
  });
  return () => {
    unsubPublished();
    unsubRetracted();
  };
}
