import type { Env } from '../env'
import type { ActivityPubModule } from '../activitypub'
import { startChannelPublishing } from './registry'
import { mastodonChannel } from './mastodonChannel'
import { telegramChannels } from './telegramChannel'
import type { PublishChannel } from './types'

export type { PublishChannel, ChannelPlatform } from './types'
export { startChannelPublishing } from './registry'
export { mastodonChannel } from './mastodonChannel'
export { telegramChannels } from './telegramChannel'

/**
 * Assemble the configured distribution channels for the paper:
 *  - Mastodon (one channel, all editions, via ActivityPub) — always present.
 *  - One Telegram channel per configured edition; each self-disables when its token
 *    env var is absent.
 *
 * Add a future destination (WhatsApp, another per-language Telegram channel, …) by
 * extending this list / the Telegram config — routing by language is handled by the
 * registry via each channel's `servesLanguage`.
 */
export function buildChannels(env: Env, activityPub: ActivityPubModule): PublishChannel[] {
  return [mastodonChannel(activityPub), ...telegramChannels(env)]
}

/**
 * Build the channel set and start publishing: subscribes ONCE to the
 * article-published transition and routes each published article to every enabled
 * channel that serves its edition. Returns a stop function that unsubscribes
 * (graceful shutdown / test teardown).
 */
export function startChannels(env: Env, activityPub: ActivityPubModule): () => void {
  return startChannelPublishing(buildChannels(env, activityPub))
}
