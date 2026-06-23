import type { Article } from '@gwj/shared-types'
import { buildAnnounceActivity, buildCreateActivity } from './documents'
import { followerService } from './followerService'
import { deliverActivity, fetchRemoteActor, type FederationFetchOptions } from './remoteActor'
import type { ActorIdentity } from './identity'
import { logger } from '../logger'

/**
 * Outbound federation delivery on publish, PER ACTOR.
 *
 * Each actor signs with its OWN key and delivers to its OWN followers (deduped by
 * shared inbox). The fan-out is best-effort (`Promise.allSettled`): individual
 * failures are logged and never block or fail the publish response. With no
 * followers or no signing key for an actor, that actor's delivery is a logged
 * no-op.
 *
 * SCALE PATH: at meaningful follower counts this in-process fan-out should move to
 * a durable queue (per-inbox jobs with retry/backoff and dead-lettering) so a
 * publish enqueues fast and delivery survives restarts. We intentionally do NOT
 * fabricate that infrastructure here; the hook is structured so swapping in a
 * queue producer is a localized change.
 */

/** A resolved signing key for one actor. */
export interface ActorSigningKey {
  privateKeyPem: string
  keyId: string
}

export interface DeliveryServiceDeps {
  /**
   * Resolve an actor's signing key by local username; null when unavailable
   * (disables that actor's delivery as a logged no-op). Async because keys are
   * persisted per actor and generated lazily.
   */
  getSigningKey: (username: string) => Promise<ActorSigningKey | null>
  fetchOptions?: FederationFetchOptions
}

export interface DeliveryService {
  /** Deliver a `Create`→`Note` authored by `author` to the author's followers. */
  deliverCreate(author: ActorIdentity, article: Article): Promise<void>
  /** Deliver an `Announce` of the author's Note by `announcer` to the announcer's followers. */
  deliverAnnounce(announcer: ActorIdentity, noteAuthor: ActorIdentity, article: Article): Promise<void>
  /** Send a signed Accept (to a Follow) from `actor` to a single follower inbox. */
  deliverAccept(actor: ActorIdentity, inbox: string, accept: Record<string, unknown>): Promise<void>
  /** Resolve a remote actor's inbox details (for persisting a follower). */
  resolveFollowerInbox(actorId: string): Promise<{ inbox: string; sharedInbox?: string }>
}

export function createDeliveryService(deps: DeliveryServiceDeps): DeliveryService {
  const fetchOptions = deps.fetchOptions ?? {}

  /** Fan a stringified activity out to one actor's distinct follower inboxes. */
  async function fanOut(
    actor: ActorIdentity,
    key: ActorSigningKey,
    body: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    const targets = await followerService.listDeliveryTargets(actor.username)
    if (targets.length === 0) {
      logger.info('activitypub delivery skipped (no followers)', { actor: actor.username, ...context })
      return
    }
    const results = await Promise.allSettled(
      targets.map((inbox) =>
        deliverActivity({
          ...fetchOptions,
          privateKeyPem: key.privateKeyPem,
          keyId: key.keyId,
          inbox,
          body,
        }),
      ),
    )
    const delivered = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length
    logger.info('activitypub delivery complete', {
      actor: actor.username,
      targets: targets.length,
      delivered,
      failed: targets.length - delivered,
      ...context,
    })
  }

  return {
    async deliverCreate(author, article) {
      const key = await deps.getSigningKey(author.username)
      if (!key) {
        logger.info('activitypub delivery skipped (no signing key)', {
          actor: author.username,
          articleId: article.id,
        })
        return
      }
      const body = JSON.stringify(buildCreateActivity(author, article, { withContext: true }))
      await fanOut(author, key, body, { articleId: article.id, kind: 'Create' })
    },

    async deliverAnnounce(announcer, noteAuthor, article) {
      const key = await deps.getSigningKey(announcer.username)
      if (!key) {
        logger.info('activitypub delivery skipped (no signing key)', {
          actor: announcer.username,
          articleId: article.id,
        })
        return
      }
      const body = JSON.stringify(
        buildAnnounceActivity(announcer, noteAuthor, article, { withContext: true }),
      )
      await fanOut(announcer, key, body, { articleId: article.id, kind: 'Announce' })
    },

    async deliverAccept(actor, inbox, accept) {
      const key = await deps.getSigningKey(actor.username)
      if (!key) {
        logger.warn('activitypub accept skipped (no signing key)', { actor: actor.username, inbox })
        return
      }
      await deliverActivity({
        ...fetchOptions,
        privateKeyPem: key.privateKeyPem,
        keyId: key.keyId,
        inbox,
        body: JSON.stringify(accept),
      })
    },

    async resolveFollowerInbox(actorId) {
      const actor = await fetchRemoteActor(actorId, fetchOptions)
      const inbox = actor.inbox
      if (!inbox) throw new Error(`Remote actor ${actorId} has no inbox`)
      return { inbox, sharedInbox: actor.endpoints?.sharedInbox }
    },
  }
}
