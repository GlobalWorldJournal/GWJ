import type { Router } from 'express';
import type { Article } from '@gwj/shared-types';
import { DEFAULT_LANGUAGE, isLanguage } from '@gwj/shared-types';
import type { Env } from '../env';
import { countArticles } from '../db/repositories/articleRepository';
import { logger } from '../logger';
import { buildActorRegistry, type ActorIdentity, type ActorRegistry } from './identity';
import { resolveActorKeyPair, type ActorKeyPair } from './keyService';
import { createActivityPubRouter } from './router';
import { createInboxService } from './inboxService';
import { createDeliveryService, type DeliveryService } from './deliveryService';
import type { FederationFetchOptions } from './remoteActor';

/**
 * The wired multi-actor ActivityPub feature: an Express router to mount and a
 * `deliverArticle` step that federates one published article.
 *
 * (The boot-time `initialize()` that re-scoped legacy single-actor follower rows
 * is gone: `followers.actor_username` is NOT NULL in PostgreSQL, and the one-time
 * Mongo → Postgres copy assigns such a row to the default edition while copying.)
 *
 * The module no longer subscribes to article-published transitions itself: the
 * Mastodon distribution channel calls {@link ActivityPubModule.deliverArticle}, and
 * the channel registry owns the single article-published subscription. This keeps
 * the federation delivery logic intact while letting it fan out alongside other
 * channels (Telegram, …).
 *
 * Per-actor signing keys are resolved LAZILY and cached: the first time an actor's
 * key is needed (its Actor document is fetched, or it delivers/accepts), the key is
 * read from — or generated and persisted to — the `actor_keys` table. This avoids generating 21
 * keypairs eagerly on boot while keeping each request fast after warm-up.
 */
export interface ActivityPubModule {
  router: Router;
  registry: ActorRegistry;
  delivery: DeliveryService;
  /**
   * Federate one published article: the WRITER actor authors the Create and the
   * EDITION actor Announces it (or, for a non-roster byline, the edition authors the
   * Create directly). Best-effort — rejects only on an unexpected delivery error;
   * with no followers or signing key it is a logged no-op.
   */
  deliverArticle(article: Article): Promise<void>;
}

export interface ActivityPubOptions {
  /**
   * Test seam: pre-resolved keypairs by username, skipping database generation.
   * Any username not present falls back to the `actor_keys` table.
   */
  keyPairs?: Record<string, ActorKeyPair>;
  /** Test seam: injectable fetch + DNS for outbound federation. */
  fetchOptions?: FederationFetchOptions;
}

export function createActivityPub(env: Env, options: ActivityPubOptions = {}): ActivityPubModule {
  const registry = buildActorRegistry(env);

  // Per-actor key cache: username → resolved keypair. Populated lazily.
  const keyCache = new Map<string, ActorKeyPair>();
  for (const [username, pair] of Object.entries(options.keyPairs ?? {})) {
    keyCache.set(username, pair);
  }
  // De-dupe concurrent resolutions of the same actor's key.
  const inflight = new Map<string, Promise<ActorKeyPair>>();

  async function resolveKey(username: string): Promise<ActorKeyPair> {
    const cached = keyCache.get(username);
    if (cached) return cached;
    const pending = inflight.get(username);
    if (pending) return pending;
    const promise = resolveActorKeyPair(username)
      .then((pair) => {
        keyCache.set(username, pair);
        inflight.delete(username);
        return pair;
      })
      .catch((err: unknown) => {
        inflight.delete(username);
        throw err;
      });
    inflight.set(username, promise);
    return promise;
  }

  const getPublicKeyPem = async (username: string): Promise<string | null> => {
    if (!registry.get(username)) return null;
    try {
      return (await resolveKey(username)).publicKeyPem;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('activitypub: failed to resolve actor key', { username, message });
      return null;
    }
  };

  const getSigningKey = async (
    username: string,
  ): Promise<{ privateKeyPem: string; keyId: string } | null> => {
    const actor = registry.get(username);
    if (!actor) return null;
    try {
      const pair = await resolveKey(username);
      return { privateKeyPem: pair.privateKeyPem, keyId: actor.publicKeyId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('activitypub: failed to resolve signing key', { username, message });
      return null;
    }
  };

  const delivery = createDeliveryService({ getSigningKey, fetchOptions: options.fetchOptions });
  const inbox = createInboxService({ registry, delivery, fetchOptions: options.fetchOptions });

  const router = createActivityPubRouter({
    registry,
    getPublicKeyPem,
    inbox,
    countPublished: () => countArticles({ status: 'published' }),
    countForActor: (actor) => countForActor(actor),
  });

  /** Count published articles in one actor's outbox scope (language or author). */
  function countForActor(actor: ActorIdentity): Promise<number> {
    return countArticles({
      status: 'published',
      language: actor.kind === 'edition' ? actor.language : undefined,
      author: actor.kind === 'writer' ? actor.authorName : undefined,
    });
  }

  /**
   * Federate a published article: the WRITER actor authors the Create (delivered to
   * its followers), then the EDITION actor for the article's language Announces that
   * same Note (delivered to ITS followers) — so writer-followers get the post and
   * edition-followers get a boost, no duplicate Notes. Fallback: a non-roster byline
   * has no writer actor, so the edition authors the Create directly (no Announce).
   */
  async function deliverArticle(article: Article): Promise<void> {
    const language = isLanguage(article.language) ? article.language : DEFAULT_LANGUAGE;
    const edition = registry.editionFor(language);
    const writer = registry.writerForAuthor(article.author);

    if (writer) {
      // The writer Create (to the writer's followers) and the edition Announce (to
      // the edition's followers) are independent — different follower sets, no shared
      // state — so run them concurrently rather than serially.
      await Promise.allSettled([
        delivery.deliverCreate(writer, article),
        delivery.deliverAnnounce(edition, writer, article),
      ]);
    } else {
      await delivery.deliverCreate(edition, article);
    }
  }

  return {
    router,
    registry,
    delivery,
    deliverArticle,
  };
}
