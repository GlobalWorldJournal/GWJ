import type { Article } from '@gwj/shared-types';
import {
  buildAnnounceActivity,
  buildCreateActivity,
  buildDeleteActivity,
  buildUpdateActivity,
} from './documents';
import { followerService } from './followerService';
import { deliverActivity, fetchRemoteActor, type FederationFetchOptions } from './remoteActor';
import type { ActorIdentity } from './identity';
import { logger } from '../logger';

/**
 * Outbound federation delivery, PER ACTOR.
 *
 * Each activity is signed by its actor's OWN key and delivered to the followers of
 * its audience (deduped by shared inbox). Within one delivery the per-inbox fan-out
 * is best-effort (`Promise.allSettled`): an unreachable inbox is logged, not retried.
 * The delivery as a whole is a job of the distribution outbox (channels/outbox.ts),
 * which retries it when it rejects. With no followers or no signing key for an
 * actor, that actor's delivery is a logged no-op.
 */

/** A resolved signing key for one actor. */
export interface ActorSigningKey {
  privateKeyPem: string;
  keyId: string;
}

export interface DeliveryServiceDeps {
  /**
   * Resolve an actor's signing key by local username; null when unavailable
   * (disables that actor's delivery as a logged no-op). Async because keys are
   * persisted per actor and generated lazily.
   */
  getSigningKey: (username: string) => Promise<ActorSigningKey | null>;
  fetchOptions?: FederationFetchOptions;
}

export interface DeliveryService {
  /** Deliver a `Create`→`Note` (id `noteId`) authored by `author` to the author's followers. */
  deliverCreate(author: ActorIdentity, article: Article, noteId: string): Promise<void>;
  /** Deliver `announcer`'s `Announce` of the Note `noteId` to the announcer's followers. */
  deliverAnnounce(announcer: ActorIdentity, article: Article, noteId: string): Promise<void>;
  /**
   * Deliver an `Update` of the Note `noteId` by its `author` to the followers of
   * every actor in `audience` (the author, and the edition that boosted it).
   */
  deliverUpdate(
    author: ActorIdentity,
    audience: readonly ActorIdentity[],
    article: Article,
    noteId: string,
  ): Promise<void>;
  /** Deliver a `Delete` of the Note `noteId` by its `author` to `audience`'s followers. */
  deliverDelete(
    author: ActorIdentity,
    audience: readonly ActorIdentity[],
    noteId: string,
  ): Promise<void>;
  /** Send a signed Accept (to a Follow) from `actor` to a single follower inbox. */
  deliverAccept(
    actor: ActorIdentity,
    inbox: string,
    accept: Record<string, unknown>,
  ): Promise<void>;
  /** Resolve a remote actor's inbox details (for persisting a follower). */
  resolveFollowerInbox(actorId: string): Promise<{ inbox: string; sharedInbox?: string }>;
}

export function createDeliveryService(deps: DeliveryServiceDeps): DeliveryService {
  const fetchOptions = deps.fetchOptions ?? {};

  /**
   * Sign `activity` as `actor` and fan it out to the distinct inboxes of the
   * followers of every actor in `audience`.
   */
  async function deliver(
    actor: ActorIdentity,
    audience: readonly ActorIdentity[],
    activity: Record<string, unknown>,
    context: Record<string, unknown>,
  ): Promise<void> {
    const key = await deps.getSigningKey(actor.username);
    if (!key) {
      logger.info('activitypub delivery skipped (no signing key)', {
        actor: actor.username,
        ...context,
      });
      return;
    }
    const targets = new Set<string>();
    for (const member of audience) {
      for (const inbox of await followerService.listDeliveryTargets(member.username)) {
        targets.add(inbox);
      }
    }
    if (targets.size === 0) {
      logger.info('activitypub delivery skipped (no followers)', {
        actor: actor.username,
        ...context,
      });
      return;
    }
    const body = JSON.stringify(activity);
    const results = await Promise.allSettled(
      [...targets].map((inbox) =>
        deliverActivity({
          ...fetchOptions,
          privateKeyPem: key.privateKeyPem,
          keyId: key.keyId,
          inbox,
          body,
        }),
      ),
    );
    const delivered = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length;
    logger.info('activitypub delivery complete', {
      actor: actor.username,
      targets: targets.size,
      delivered,
      failed: targets.size - delivered,
      ...context,
    });
  }

  return {
    async deliverCreate(author, article, noteId) {
      const activity = buildCreateActivity(author, article, { withContext: true, noteId });
      await deliver(author, [author], activity, { articleId: article.id, kind: 'Create' });
    },

    async deliverAnnounce(announcer, article, noteId) {
      const activity = buildAnnounceActivity(announcer, noteId, article, { withContext: true });
      await deliver(announcer, [announcer], activity, {
        articleId: article.id,
        kind: 'Announce',
      });
    },

    async deliverUpdate(author, audience, article, noteId) {
      const activity = buildUpdateActivity(author, noteId, article, { withContext: true });
      await deliver(author, audience, activity, { articleId: article.id, kind: 'Update' });
    },

    async deliverDelete(author, audience, noteId) {
      const activity = buildDeleteActivity(author, noteId, { withContext: true });
      await deliver(author, audience, activity, { noteId, kind: 'Delete' });
    },

    async deliverAccept(actor, inbox, accept) {
      const key = await deps.getSigningKey(actor.username);
      if (!key) {
        logger.warn('activitypub accept skipped (no signing key)', {
          actor: actor.username,
          inbox,
        });
        return;
      }
      await deliverActivity({
        ...fetchOptions,
        privateKeyPem: key.privateKeyPem,
        keyId: key.keyId,
        inbox,
        body: JSON.stringify(accept),
      });
    },

    async resolveFollowerInbox(actorId) {
      const actor = await fetchRemoteActor(actorId, fetchOptions);
      const inbox = actor.inbox;
      if (!inbox) throw new Error(`Remote actor ${actorId} has no inbox`);
      return { inbox, sharedInbox: actor.endpoints?.sharedInbox };
    },
  };
}
