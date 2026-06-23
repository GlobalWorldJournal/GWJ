import type { Env } from '../env'
import type { ActivityPubModule } from '../activitypub'
import { startChannelPublishing } from './registry'
import { mastodonChannel } from './mastodonChannel'
import { telegramChannels } from './telegramChannel'

/**
 * Assemble the paper's distribution channels and start publishing: subscribes ONCE
 * to the article-published transition and routes each published article to every
 * enabled channel that serves its edition. Returns a stop function that
 * unsubscribes (graceful shutdown / test teardown).
 *
 * Channels today: Mastodon (all editions, via ActivityPub) + one Telegram channel
 * per configured edition (each self-disables when its token env var is absent). Add
 * a destination (WhatsApp, another per-language Telegram channel) by extending the
 * list / the Telegram config — language routing is handled by the registry via each
 * channel's `servesLanguage`.
 */
export function startChannels(env: Env, activityPub: ActivityPubModule): () => void {
  return startChannelPublishing([mastodonChannel(activityPub), ...telegramChannels(env)])
}
