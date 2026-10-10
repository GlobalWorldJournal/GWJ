import type { Article } from '@gwj/shared-types';
import type { ActivityPubModule, FederatedNote } from '../activitypub';
import type { PublishChannel } from './types';

/** Read a recorded Mastodon delivery back into the Note it federated. */
function federatedNote(ref: Record<string, unknown>): FederatedNote | null {
  const { noteId, author, announcer } = ref;
  if (typeof noteId !== 'string' || typeof author !== 'string') return null;
  return typeof announcer === 'string' ? { noteId, author, announcer } : { noteId, author };
}

/**
 * The Mastodon / fediverse distribution channel: a thin adapter over the
 * ActivityPub module, which owns the federation itself — the writer Create plus
 * edition Announce on publish, an Update of that Note on a visible edit, and a
 * Delete when the story leaves public view. The ref it records is the delivered
 * Note (id, author, announcer).
 *
 * It serves ALL editions (the module picks the edition and writer actors per
 * article) and is always enabled: with no followers or no signing key a delivery
 * is a logged no-op inside the module.
 */
export function mastodonChannel(activityPub: ActivityPubModule): PublishChannel {
  return {
    name: 'mastodon',
    platform: 'mastodon',
    servesLanguage: () => true,
    isEnabled: () => true,
    async publish(article: Article, { deliveryId }) {
      const note = await activityPub.deliverArticle(article, deliveryId);
      return { ...note };
    },
    async update(article: Article, ref: Record<string, unknown>) {
      const note = federatedNote(ref);
      if (note) await activityPub.updateArticle(article, note);
    },
    async retract(ref: Record<string, unknown>) {
      const note = federatedNote(ref);
      if (note) await activityPub.deleteArticle(note);
    },
  };
}
