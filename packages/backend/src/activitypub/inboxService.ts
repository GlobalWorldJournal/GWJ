import type { InboundActivity } from '@gwj/shared-types'
import { InboundActivitySchema } from '@gwj/shared-types'
import {
  assertDigestMatches,
  assertFreshDate,
  parseSignatureHeader,
  verifySignature,
  type VerifyRequestInput,
} from './httpSignature'
import { fetchRemoteActor, type FederationFetchOptions } from './remoteActor'
import { buildAcceptActivity } from './documents'
import { followerService } from './followerService'
import type { DeliveryService } from './deliveryService'
import type { ActorIdentity, ActorRegistry } from './identity'
import { logger } from '../logger'

/** Result of processing an inbound activity: an HTTP status + short reason. */
export interface InboxResult {
  status: number
  reason: string
}

export interface InboxServiceDeps {
  registry: ActorRegistry
  delivery: DeliveryService
  fetchOptions?: FederationFetchOptions
}

/** Input to handle an inbound request: the verify input plus the target actor. */
export interface InboxHandleInput extends VerifyRequestInput {
  /**
   * The local actor whose inbox received this, when known (the `/users/:username/
   * inbox` route). For the shared `/inbox` it is undefined and the target is
   * resolved from the activity's `object`.
   */
  targetActor?: ActorIdentity
}

/** Extract the `keyId` from a request's Signature header, or null. */
function keyIdFromSignature(signatureHeader: string | undefined): string | null {
  if (!signatureHeader) return null
  const params = parseSignatureHeader(signatureHeader)
  return params.keyId ?? null
}

/**
 * The actor URL that owns a `keyId`. Mastodon uses `<actor>#main-key`, so we strip
 * the fragment to fetch the actor document and read its `publicKey.publicKeyPem`.
 */
function actorUrlFromKeyId(keyId: string): string {
  const hash = keyId.indexOf('#')
  return hash >= 0 ? keyId.slice(0, hash) : keyId
}

export interface InboxService {
  /**
   * Verify and process an inbound activity. The HTTP layer supplies the method,
   * proxied path, headers, raw body, and (for a per-actor inbox) the target actor.
   */
  handle(input: InboxHandleInput): Promise<InboxResult>
}

export function createInboxService(deps: InboxServiceDeps): InboxService {
  const fetchOptions = deps.fetchOptions ?? {}

  return {
    async handle(input) {
      const headers: Record<string, string> = {}
      for (const [name, value] of Object.entries(input.headers)) {
        if (value === undefined) continue
        headers[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value
      }

      // 1. Freshness: reject stale/missing Date to blunt replay.
      const dateError = assertFreshDate(headers.date)
      if (dateError) return { status: 401, reason: dateError }

      // 2. Body integrity: the Digest header must match the raw body.
      const digestError = assertDigestMatches(headers.digest, input.rawBody)
      if (digestError) return { status: 401, reason: digestError }

      // 3. Locate the signing key by fetching the remote actor named in keyId.
      const keyId = keyIdFromSignature(headers.signature)
      if (!keyId) return { status: 401, reason: 'Missing or unparseable Signature keyId' }

      let publicKeyPem: string
      // The identities the verified signature actually proves ownership of: the
      // fetched signer actor's id and the key's declared owner. An inbound
      // activity may only claim `actor` values among these (see binding below).
      let signerActorId: string
      let signerKeyOwner: string | undefined
      try {
        const remote = await fetchRemoteActor(actorUrlFromKeyId(keyId), fetchOptions)
        if (!remote.publicKey?.publicKeyPem) {
          return { status: 401, reason: 'Remote actor exposes no public key' }
        }
        publicKeyPem = remote.publicKey.publicKeyPem
        signerActorId = remote.id
        signerKeyOwner = remote.publicKey.owner
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Could not fetch signing actor'
        logger.warn('activitypub inbox: failed to fetch signer', { keyId, reason })
        return { status: 401, reason: 'Could not resolve signing key' }
      }

      // 4. Cryptographic verification, binding `host` to the apex (not the proxied Host).
      const verification = verifySignature(
        { ...input, expectedHost: deps.registry.domain },
        publicKeyPem,
      )
      if (!verification.ok) {
        logger.warn('activitypub inbox: signature rejected', { keyId, reason: verification.reason })
        return { status: 401, reason: verification.reason }
      }

      // 5. Parse the activity.
      const parsed = InboundActivitySchema.safeParse(parseBody(input.rawBody))
      if (!parsed.success) return { status: 400, reason: 'Malformed activity' }

      // 6. Bind the signer to the claimed actor. A valid signature only proves
      // the holder of `keyId` signed the request — without this check that holder
      // could forge activities (Follow/Undo/Delete) as ANY actor by setting a
      // different `activity.actor`. The claimed actor must be the signer itself
      // (its actor id) or the identity that owns the signing key.
      const claimedActor = parsed.data.actor
      if (!claimedActor) return { status: 400, reason: 'Activity has no actor' }
      if (claimedActor !== signerActorId && claimedActor !== signerKeyOwner) {
        logger.warn('activitypub inbox: signer/actor mismatch', {
          keyId,
          claimedActor,
          signerActorId,
        })
        return { status: 401, reason: 'Signer does not match activity actor' }
      }

      // 7. Dispatch the verified, signer-bound activity by type.
      return dispatch(parsed.data, input.targetActor, deps)
    },
  }
}

/** Parse the raw body to JSON; returns null on failure (caller rejects as 400). */
function parseBody(rawBody: Buffer): unknown {
  try {
    return JSON.parse(rawBody.toString('utf8'))
  } catch {
    return null
  }
}

/** Dispatch a verified activity by type to the resolved local actor. */
async function dispatch(
  activity: InboundActivity,
  targetActor: ActorIdentity | undefined,
  deps: InboxServiceDeps,
): Promise<InboxResult> {
  switch (activity.type) {
    case 'Follow':
      return handleFollow(activity, targetActor, deps)
    case 'Undo':
      return handleUndo(activity, targetActor, deps)
    case 'Delete':
      return handleDelete(activity, deps)
    default:
      // Unknown/unsupported activities are accepted and ignored (per AP guidance).
      logger.info('activitypub inbox: ignoring activity', { type: activity.type })
      return { status: 202, reason: 'Accepted (ignored)' }
  }
}

/** Read an activity object's `id` whether it is a string ref or an embedded object. */
function objectId(object: unknown): string | null {
  if (typeof object === 'string') return object
  if (object && typeof object === 'object' && 'id' in object) {
    const id = (object as { id: unknown }).id
    if (typeof id === 'string') return id
  }
  return null
}

/** Read an embedded object's `type`, if present. */
function objectType(object: unknown): string | null {
  if (object && typeof object === 'object' && 'type' in object) {
    const type = (object as { type: unknown }).type
    if (typeof type === 'string') return type
  }
  return null
}

/**
 * Resolve which LOCAL actor an activity is about. For a per-actor inbox we already
 * know it (`targetActor`); for the shared inbox we map the target actor id (the
 * Follow's `object`) back to a registered local actor.
 */
function resolveLocalActor(
  targetActor: ActorIdentity | undefined,
  targetActorId: string | null,
  registry: ActorRegistry,
): ActorIdentity | undefined {
  if (targetActor) return targetActor
  if (!targetActorId) return undefined
  return registry.all.find((a) => a.actorId === targetActorId)
}

async function handleFollow(
  activity: InboundActivity,
  targetActor: ActorIdentity | undefined,
  deps: InboxServiceDeps,
): Promise<InboxResult> {
  const remoteActorId = activity.actor
  if (!remoteActorId) return { status: 400, reason: 'Follow has no actor' }

  const followedId = objectId(activity.object)
  const local = resolveLocalActor(targetActor, followedId, deps.registry)
  if (!local) return { status: 404, reason: 'Follow targets an unknown actor' }
  // Even on a per-actor inbox, the Follow `object` must name THIS actor.
  if (followedId !== local.actorId) {
    return { status: 400, reason: 'Follow targets a different actor' }
  }

  try {
    const { inbox, sharedInbox } = await deps.delivery.resolveFollowerInbox(remoteActorId)
    await followerService.upsert({ actorUsername: local.username, actorId: remoteActorId, inbox, sharedInbox })
    // Acknowledge the Follow with a signed Accept from THIS actor to the follower.
    const accept = buildAcceptActivity(local, {
      id: activity.id,
      actor: remoteActorId,
      type: 'Follow',
      object: activity.object,
    })
    await deps.delivery.deliverAccept(local, inbox, accept)
    logger.info('activitypub follower added', { actor: local.username, follower: remoteActorId })
    return { status: 202, reason: 'Follow accepted' }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Follow processing failed'
    logger.warn('activitypub follow failed', { actor: local.username, follower: remoteActorId, reason })
    return { status: 400, reason }
  }
}

async function handleUndo(
  activity: InboundActivity,
  targetActor: ActorIdentity | undefined,
  deps: InboxServiceDeps,
): Promise<InboxResult> {
  if (objectType(activity.object) !== 'Follow') {
    return { status: 202, reason: 'Accepted (unsupported Undo target)' }
  }
  const remoteActorId = activity.actor
  if (!remoteActorId) return { status: 400, reason: 'Undo has no actor' }

  // The inner Follow's `object` tells us which local actor is being unfollowed.
  const innerObject =
    activity.object && typeof activity.object === 'object' && 'object' in activity.object
      ? (activity.object as { object?: unknown }).object
      : undefined
  const local = resolveLocalActor(targetActor, objectId(innerObject), deps.registry)
  if (!local) return { status: 202, reason: 'Accepted (unknown actor)' }

  const removed = await followerService.remove(local.username, remoteActorId)
  logger.info('activitypub follower removed (undo)', { actor: local.username, follower: remoteActorId, removed })
  return { status: 202, reason: 'Undo processed' }
}

async function handleDelete(activity: InboundActivity, deps: InboxServiceDeps): Promise<InboxResult> {
  // A server deleting an actor sends Delete with object === that actor's id. If it
  // followed ANY local actor, drop those rows. Other Deletes are accepted/ignored.
  const deletedId = objectId(activity.object)
  if (deletedId && deletedId === activity.actor) {
    const removed = await followerService.removeEverywhere(deletedId)
    if (removed > 0) logger.info('activitypub follower removed (actor delete)', { follower: deletedId, removed })
  }
  return { status: 202, reason: 'Delete processed' }
}
