import type { Env } from '../env';
import type { ActivityPubModule } from '../activitypub';
import { mastodonChannel } from './mastodonChannel';
import { telegramChannels } from './telegramChannel';
import type { PublishChannel } from './types';

/**
 * The paper's distribution channels: Mastodon (all editions, via ActivityPub)
 * and one Telegram channel per configured edition (each self-disables when its
 * token env var is absent). Add a destination (WhatsApp, another per-language
 * Telegram channel) by extending this list or the Telegram config — language
 * routing is the registry's, via each channel's `servesLanguage`.
 */
export function buildChannels(env: Env, activityPub: ActivityPubModule): PublishChannel[] {
  return [mastodonChannel(activityPub), ...telegramChannels(env)];
}
