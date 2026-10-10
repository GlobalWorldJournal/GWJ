import type { Article } from '@gwj/shared-types';
import type { ActivityPubModule } from '../activitypub';
import type { PublishChannel } from './types';

/**
 * The Mastodon / fediverse distribution channel. It is a thin wrapper around the
 * EXISTING ActivityPub delivery: `publish` calls {@link ActivityPubModule.deliverArticle},
 * which runs the unchanged writer-Create + edition-Announce (or edition-Create
 * fallback) fan-out. No federation logic lives here — only the channel adapter.
 *
 * It serves ALL editions: the underlying delivery picks the right edition/writer
 * actor per the article's language, so a single Mastodon channel covers every
 * language (`servesLanguage` → true for all).
 *
 * `isEnabled()` returns `true`: the underlying delivery already no-ops safely when an
 * actor has no followers or no resolvable signing key (those cases are logged inside
 * the delivery service), so there is no per-process credential to gate on.
 */
export function mastodonChannel(activityPub: ActivityPubModule): PublishChannel {
  return {
    name: 'mastodon',
    platform: 'mastodon',
    servesLanguage: () => true,
    isEnabled: () => true,
    publish: (article: Article) => activityPub.deliverArticle(article),
  };
}
