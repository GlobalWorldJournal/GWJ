import type { Router } from 'express'
import type { Article } from '@gwj/shared-types'
import { DEFAULT_LANGUAGE, isLanguage } from '@gwj/shared-types'
import type { Env } from '../env'
import { onArticlePublished } from '../services/articleService'
import { ArticleModel } from '../models/Article'
import { FollowerModel } from '../models/Follower'
import { logger } from '../logger'
import { buildActorRegistry, resolveEditionUsernames, type ActorIdentity, type ActorRegistry } from './identity'
import { resolveActorKeyPair, type ActorKeyPair } from './keyService'
import { createActivityPubRouter } from './router'
import { createInboxService } from './inboxService'
import { createDeliveryService, type DeliveryService } from './deliveryService'
import type { FederationFetchOptions } from './remoteActor'

/**
 * The wired multi-actor ActivityPub feature: an Express router to mount plus an
 * async `initialize` step (run after Mongo connects) that migrates legacy follower
 * rows and starts publish-delivery.
 *
 * Per-actor signing keys are resolved LAZILY and cached: the first time an actor's
 * key is needed (its Actor document is fetched, or it delivers/accepts), the key is
 * read from — or generated and persisted to — Mongo. This avoids generating 21
 * keypairs eagerly on boot while keeping each request fast after warm-up.
 */
export interface ActivityPubModule {
  router: Router
  registry: ActorRegistry
  delivery: DeliveryService
  /** Migrate legacy followers and wire the publish listener. Idempotent. */
  initialize(): Promise<void>
  /** Remove the publish listener. Use in tests that build multiple app instances. */
  dispose(): void
}

export interface ActivityPubOptions {
  /**
   * Test seam: pre-resolved keypairs by username, skipping Mongo generation. Any
   * username not present falls back to Mongo resolution.
   */
  keyPairs?: Record<string, ActorKeyPair>
  /** Test seam: injectable fetch + DNS for outbound federation. */
  fetchOptions?: FederationFetchOptions
}

export function createActivityPub(env: Env, options: ActivityPubOptions = {}): ActivityPubModule {
  const registry = buildActorRegistry(env)

  // Per-actor key cache: username → resolved keypair. Populated lazily.
  const keyCache = new Map<string, ActorKeyPair>()
  for (const [username, pair] of Object.entries(options.keyPairs ?? {})) {
    keyCache.set(username, pair)
  }
  // De-dupe concurrent resolutions of the same actor's key.
  const inflight = new Map<string, Promise<ActorKeyPair>>()

  async function resolveKey(username: string): Promise<ActorKeyPair> {
    const cached = keyCache.get(username)
    if (cached) return cached
    const pending = inflight.get(username)
    if (pending) return pending
    const promise = resolveActorKeyPair(username)
      .then((pair) => {
        keyCache.set(username, pair)
        inflight.delete(username)
        return pair
      })
      .catch((err: unknown) => {
        inflight.delete(username)
        throw err
      })
    inflight.set(username, promise)
    return promise
  }

  const getPublicKeyPem = async (username: string): Promise<string | null> => {
    if (!registry.get(username)) return null
    try {
      return (await resolveKey(username)).publicKeyPem
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('activitypub: failed to resolve actor key', { username, message })
      return null
    }
  }

  const getSigningKey = async (
    username: string,
  ): Promise<{ privateKeyPem: string; keyId: string } | null> => {
    const actor = registry.get(username)
    if (!actor) return null
    try {
      const pair = await resolveKey(username)
      return { privateKeyPem: pair.privateKeyPem, keyId: actor.publicKeyId }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('activitypub: failed to resolve signing key', { username, message })
      return null
    }
  }

  const delivery = createDeliveryService({ getSigningKey, fetchOptions: options.fetchOptions })
  const inbox = createInboxService({ registry, delivery, fetchOptions: options.fetchOptions })

  const router = createActivityPubRouter({
    registry,
    getPublicKeyPem,
    inbox,
    countPublished: () => ArticleModel.countDocuments({ status: 'published' }),
    countForActor: (actor) => countForActor(actor),
  })

  /** Count published articles in one actor's outbox scope (language or author). */
  function countForActor(actor: ActorIdentity): Promise<number> {
    const filter: Record<string, unknown> = { status: 'published' }
    if (actor.kind === 'edition' && actor.language) filter.language = actor.language
    if (actor.kind === 'writer') filter.author = actor.authorName
    return ArticleModel.countDocuments(filter)
  }

  /**
   * On publish: the WRITER actor authors the Create (delivered to its followers),
   * then the EDITION actor for the article's language Announces that same Note
   * (delivered to ITS followers) — so writer-followers get the post and
   * edition-followers get a boost, no duplicate Notes. Fallback: a non-roster byline
   * has no writer actor, so the edition authors the Create directly (no Announce).
   */
  async function onPublish(article: Article): Promise<void> {
    const language = isLanguage(article.language) ? article.language : DEFAULT_LANGUAGE
    const edition = registry.editionFor(language)
    const writer = registry.writerForAuthor(article.author)

    if (writer) {
      await delivery.deliverCreate(writer, article)
      await delivery.deliverAnnounce(edition, writer, article)
    } else {
      await delivery.deliverCreate(edition, article)
    }
  }

  // The listener is sync and must not throw; it launches best-effort delivery
  // without blocking the publish response.
  const unsubscribe = onArticlePublished((article) => {
    void onPublish(article).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('activitypub publish delivery error', { articleId: article.id, message })
    })
  })

  let initialized = false

  return {
    router,
    registry,
    delivery,
    async initialize() {
      if (initialized) return
      initialized = true
      await migrateLegacyFollowers(resolveEditionUsernames(env)[DEFAULT_LANGUAGE])
    },
    dispose() {
      unsubscribe()
    },
  }
}

/**
 * Backfill follower rows from the prior SINGLE-actor shape (no `actorUsername`) to
 * the default English edition. Idempotent: a no-op once every row is scoped. This
 * runs once at boot before the new compound unique index is relied upon.
 */
async function migrateLegacyFollowers(defaultEditionUsername: string): Promise<void> {
  const result = await FollowerModel.updateMany(
    { actorUsername: { $exists: false } },
    { $set: { actorUsername: defaultEditionUsername } },
  )
  if (result.modifiedCount > 0) {
    logger.info('activitypub: migrated legacy followers to edition', {
      edition: defaultEditionUsername,
      migrated: result.modifiedCount,
    })
  }
}
