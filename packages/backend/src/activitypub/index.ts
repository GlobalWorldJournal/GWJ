import type { Router } from 'express';
import type { Article } from '@gwj/shared-types';
import { DEFAULT_LANGUAGE, isLanguage } from '@gwj/shared-types';
import type { Env } from '../env';
import { countArticles } from '../db/repositories/articleRepository';
import { logger } from '../logger';
import {
  buildActorRegistry,
  publicationNoteId,
  type ActorIdentity,
  type ActorRegistry,
} from './identity';
import { resolveActorKeyPair, type ActorKeyPair } from './keyService';
import { createActivityPubRouter } from './router';
import { createInboxService } from './inboxService';
import { createDeliveryService, type DeliveryService } from './deliveryService';
import type { FederationFetchOptions } from './remoteActor';

/**
 * The wired multi-actor ActivityPub feature: an Express router to mount and the
 * steps that federate an article: deliver it, update it, delete it.
 *
 * Every follower row names the actor it follows: `followers.actor_username` is
 * NOT NULL, so no boot-time re-scoping step is needed.
 *
 * The module does not watch articles itself: the Mastodon distribution channel
 * calls these steps from the distribution outbox (channels/outbox.ts), alongside
 * the other channels (Telegram, …).
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
   * Federate one publication of an article (`deliveryId` names it — see
   * `publicationNoteId`): the WRITER actor authors the Create and the EDITION
   * actor Announces it (or, for a non-roster byline, the edition authors the
   * Create directly). With no followers or signing key it is a logged no-op.
   * Resolves the delivered Note, which a later update or delete needs.
   */
  deliverArticle(article: Article, deliveryId: number): Promise<FederatedNote>;
  /** Send an Update of a delivered Note, bringing it in line with `article`. */
  updateArticle(article: Article, note: FederatedNote): Promise<void>;
  /** Send a Delete of a delivered Note (the story left public view). */
  deleteArticle(note: FederatedNote): Promise<void>;
}

/** A delivered Note: its id, the actor that authored it and the edition that boosted it. */
export interface FederatedNote {
  noteId: string;
  author: string;
  announcer?: string;
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
  async function deliverArticle(article: Article, deliveryId: number): Promise<FederatedNote> {
    const language = isLanguage(article.language) ? article.language : DEFAULT_LANGUAGE;
    const edition = registry.editionFor(language);
    const writer = registry.writerForAuthor(article.author);

    if (writer) {
      const noteId = publicationNoteId(writer, article.id, deliveryId);
      // The Create (writer's followers) and the Announce (edition's followers) go
      // to different audiences with no shared state: run them concurrently.
      await Promise.all([
        delivery.deliverCreate(writer, article, noteId),
        delivery.deliverAnnounce(edition, article, noteId),
      ]);
      return { noteId, author: writer.username, announcer: edition.username };
    }
    const noteId = publicationNoteId(edition, article.id, deliveryId);
    await delivery.deliverCreate(edition, article, noteId);
    return { noteId, author: edition.username };
  }

  /**
   * The actors a delivered Note concerns: its author (who signs) and everyone
   * whose followers saw it. Null when the author is no longer on the roster —
   * there is no key left to sign with.
   */
  function noteActors(note: FederatedNote): {
    author: ActorIdentity;
    audience: ActorIdentity[];
  } | null {
    const author = registry.get(note.author);
    if (!author) {
      logger.warn('activitypub: delivered note has no local author', { ...note });
      return null;
    }
    const announcer = note.announcer ? registry.get(note.announcer) : undefined;
    return { author, audience: announcer ? [author, announcer] : [author] };
  }

  async function updateArticle(article: Article, note: FederatedNote): Promise<void> {
    const actors = noteActors(note);
    if (actors) await delivery.deliverUpdate(actors.author, actors.audience, article, note.noteId);
  }

  async function deleteArticle(note: FederatedNote): Promise<void> {
    const actors = noteActors(note);
    if (actors) await delivery.deliverDelete(actors.author, actors.audience, note.noteId);
  }

  return {
    router,
    registry,
    delivery,
    deliverArticle,
    updateArticle,
    deleteArticle,
  };
}
