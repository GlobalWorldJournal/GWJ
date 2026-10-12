import { z } from 'zod';
import { ACTIVITY_JSON_TYPE, LD_JSON_TYPE } from '@gwj/shared-types';
import { assertSafeRemoteUrl, type AssertSafeRemoteUrlOptions } from '../net/ssrfGuard';
import { guardedGet, readBodyCapped, type FetchFn } from '../net/guardedFetch';
import { signRequest, type SignRequestOptions } from './httpSignature';
import { logger } from '../logger';

/** Timeout for any single outbound federation request. */
const FETCH_TIMEOUT_MS = 10_000;
/** Cap on a fetched actor document size to bound memory from hostile peers. */
const MAX_ACTOR_BYTES = 256 * 1024;
/** How long a fetched remote actor (and its public key) is cached. */
const ACTOR_CACHE_TTL_MS = 10 * 60 * 1000;
/** Max distinct actors held in the in-process cache. */
const ACTOR_CACHE_MAX = 2_000;

/** The minimal remote-actor shape we need: its inbox(es) and signing public key. */
const RemoteActorSchema = z.object({
  id: z.string(),
  inbox: z.string().url().optional(),
  endpoints: z.object({ sharedInbox: z.string().url().optional() }).optional(),
  publicKey: z
    .object({
      id: z.string(),
      owner: z.string().optional(),
      publicKeyPem: z.string(),
    })
    .optional(),
});
export type RemoteActor = z.infer<typeof RemoteActorSchema>;

interface CacheEntry {
  actor: RemoteActor;
  expiresAt: number;
}

const actorCache = new Map<string, CacheEntry>();

/** Drop the oldest cache entry when the cache is at capacity (simple FIFO bound). */
function evictIfFull(): void {
  if (actorCache.size < ACTOR_CACHE_MAX) return;
  const oldest = actorCache.keys().next().value;
  if (oldest !== undefined) actorCache.delete(oldest);
}

export interface FederationFetchOptions {
  /** Injectable fetch (tests); defaults to global fetch. */
  fetch?: FetchFn;
  /** Injectable DNS resolver for the SSRF guard. */
  resolveDns?: AssertSafeRemoteUrlOptions['resolve'];
}

/** Redirect hops followed (each re-guarded) when fetching a remote actor. */
const ACTOR_MAX_REDIRECTS = 1;

/**
 * Fetch and cache a remote actor by its id/URL. Used to (a) look up a signer's
 * public key for inbound verification and (b) resolve a follower's inbox. The
 * SSRF guard runs before every hop, and the body is size-capped while streaming.
 */
export async function fetchRemoteActor(
  actorUrl: string,
  options: FederationFetchOptions = {},
): Promise<RemoteActor> {
  const cached = actorCache.get(actorUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.actor;

  const response = await guardedGet(actorUrl, {
    accept: `${ACTIVITY_JSON_TYPE}, ${LD_JSON_TYPE}`,
    timeoutMs: FETCH_TIMEOUT_MS,
    maxRedirects: ACTOR_MAX_REDIRECTS,
    fetch: options.fetch,
    resolveDns: options.resolveDns,
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch remote actor ${actorUrl} (${response.status})`);
  }
  const text = (await readBodyCapped(response, MAX_ACTOR_BYTES)).toString('utf8');

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Remote actor document is not valid JSON');
  }

  const actor = RemoteActorSchema.parse(json);
  evictIfFull();
  actorCache.set(actorUrl, { actor, expiresAt: Date.now() + ACTOR_CACHE_TTL_MS });
  return actor;
}

/** Test-only helper to clear the actor cache between cases. */
export function clearRemoteActorCache(): void {
  actorCache.clear();
}

export interface DeliverOptions extends FederationFetchOptions {
  privateKeyPem: string;
  keyId: string;
  /** Destination inbox URL. */
  inbox: string;
  /** The activity JSON to POST (already stringified). */
  body: string;
}

/** Outcome of a single signed delivery attempt. */
export interface DeliveryResult {
  inbox: string;
  ok: boolean;
  status?: number;
  error?: string;
}

/**
 * Deliver a signed activity to a single inbox. Signs with the actor's private key
 * (covering `(request-target) host date digest`), enforces the SSRF guard and a
 * timeout, and refuses to follow redirects. Returns a result rather than throwing
 * so a fan-out caller can collect per-inbox outcomes.
 */
export async function deliverActivity(options: DeliverOptions): Promise<DeliveryResult> {
  try {
    const safeUrl = await assertSafeRemoteUrl(options.inbox, { resolve: options.resolveDns });
    const headers = signRequest({
      privateKeyPem: options.privateKeyPem,
      keyId: options.keyId,
      method: 'POST',
      url: safeUrl.toString(),
      body: options.body,
      headers: { 'content-type': ACTIVITY_JSON_TYPE } satisfies SignRequestOptions['headers'],
    });

    const fetchImpl = options.fetch ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetchImpl(safeUrl.toString(), {
        method: 'POST',
        headers,
        body: options.body,
        redirect: 'manual',
        signal: controller.signal,
      });
      const ok = response.status >= 200 && response.status < 300;
      if (!ok) {
        logger.warn('activitypub delivery non-2xx', {
          inbox: options.inbox,
          status: response.status,
        });
      }
      return { inbox: options.inbox, ok, status: response.status };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn('activitypub delivery failed', { inbox: options.inbox, error });
    return { inbox: options.inbox, ok: false, error };
  }
}
