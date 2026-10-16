import type { Env } from '../env';
import type { ActivityPubModule } from '../activitypub';
import type { MediaService } from '../services/mediaService';
import { mastodonChannel } from './mastodonChannel';
import { telegramChannels } from './telegramChannel';
import { facebookChannels } from './facebookChannel';
import { instagramChannels } from './instagramChannel';
import { mentionChannel } from './mentionChannel';
import { indexNowChannel } from './indexNowChannel';
import type { PublishChannel } from './types';

/**
 * The paper's distribution channels: Mastodon (all editions, via ActivityPub),
 * one Telegram channel, one Facebook Page and one Instagram Business account
 * per configured edition, GWJ's own Mention account (@gwj, English only) and
 * IndexNow (every edition, production only) — each self-disables when its own
 * credentials (or, for Mention, its stored OAuth grant) are absent. Add a destination (WhatsApp, another edition) by
 * extending this list or the relevant channel's own config — language
 * routing is the registry's, via each channel's `servesLanguage`.
 * `media` is the same service the admin API stores article images through —
 * Instagram stores its generated social cards with it, as GWJ-owned Oxy files.
 */
export function buildChannels(
  env: Env,
  activityPub: ActivityPubModule,
  media: MediaService,
): PublishChannel[] {
  return [
    mastodonChannel(activityPub),
    ...telegramChannels(env),
    ...facebookChannels(env),
    ...instagramChannels(env, media),
    mentionChannel(env),
    indexNowChannel(env),
  ];
}
