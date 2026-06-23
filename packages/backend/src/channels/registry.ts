import { DEFAULT_LANGUAGE, isLanguage, type Article } from '@gwj/shared-types'
import { onArticlePublished } from '../services/articleService'
import { logger } from '../logger'
import type { PublishChannel } from './types'

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
 * Returns an unsubscribe function that removes the listener (use it in tests that
 * build multiple app instances and at graceful shutdown).
 */
export function startChannelPublishing(channels: readonly PublishChannel[]): () => void {
  async function fanOut(article: Article): Promise<void> {
    const language = isLanguage(article.language) ? article.language : DEFAULT_LANGUAGE
    const matched = channels.filter(
      (channel) => channel.isEnabled() && channel.servesLanguage(language),
    )
    if (matched.length === 0) return
    const results = await Promise.allSettled(
      matched.map(async (channel) => {
        await channel.publish(article)
        return channel.name
      }),
    )
    results.forEach((result, index) => {
      const channel = matched[index]
      if (!channel) return
      if (result.status === 'fulfilled') {
        logger.info('channel publish succeeded', {
          channel: channel.name,
          platform: channel.platform,
          articleId: article.id,
        })
      } else {
        const message =
          result.reason instanceof Error ? result.reason.message : String(result.reason)
        logger.error('channel publish failed', {
          channel: channel.name,
          platform: channel.platform,
          articleId: article.id,
          message,
        })
      }
    })
  }

  // The listener is synchronous and must not throw: it launches the best-effort
  // fan-out without awaiting it so the publish response is never blocked.
  return onArticlePublished((article) => {
    void fanOut(article).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('channel publishing error', { articleId: article.id, message })
    })
  })
}
