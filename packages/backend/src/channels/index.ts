import type { Env } from '../env';
import type { ActivityPubModule } from '../activitypub';
import type { UploadService } from '../services/uploadService';
import { mastodonChannel } from './mastodonChannel';
import { telegramChannels } from './telegramChannel';
import { facebookChannels } from './facebookChannel';
import { instagramChannels } from './instagramChannel';
import type { PublishChannel } from './types';

/**
 * The paper's distribution channels: Mastodon (all editions, via ActivityPub),
 * one Telegram channel, one Facebook Page, and one Instagram Business account
 * per configured edition (each self-disables when its own credentials are
 * absent). Add a destination (WhatsApp, another edition) by extending this
 * list or the relevant channel's own config — language routing is the
 * registry's, via each channel's `servesLanguage`. `uploadService` is the
 * same instance the admin API uploads article images through — Instagram
 * reuses it to store its generated social cards rather than opening a second
 * S3 client.
 */
export function buildChannels(
  env: Env,
  activityPub: ActivityPubModule,
  uploadService: UploadService,
): PublishChannel[] {
  return [
    mastodonChannel(activityPub),
    ...telegramChannels(env),
    ...facebookChannels(env),
    ...instagramChannels(env, uploadService),
  ];
}
