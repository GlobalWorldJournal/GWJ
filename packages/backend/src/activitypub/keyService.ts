import { generateKeyPairSync } from 'node:crypto'
import { ActorKeyModel } from '../models/ActorKey'
import { logger } from '../logger'

/** RSA modulus length required for fediverse interop (Mastodon expects RSA-2048+). */
const RSA_MODULUS_BITS = 2048

/** A resolved actor signing key: PEM-encoded private + public halves. */
export interface ActorKeyPair {
  privateKeyPem: string
  publicKeyPem: string
}

/** Generate a fresh RSA-2048 keypair as SPKI/PKCS#8 PEM strings. */
function generateKeyPair(): ActorKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: RSA_MODULUS_BITS,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  return { privateKeyPem: privateKey, publicKeyPem: publicKey }
}

/**
 * Resolve ONE actor's signing keypair by local username:
 *  1. A persisted `ActorKey` document for this username, or
 *  2. Generate a new keypair and persist it (first use).
 *
 * Each actor (edition or writer) has its OWN keypair, so there are up to 21
 * documents. Idempotent under races: the unique index on `username` means a
 * concurrent insert loses the upsert and we re-read the winning document.
 */
export async function resolveActorKeyPair(username: string): Promise<ActorKeyPair> {
  const existing = await ActorKeyModel.findOne({ username }).lean()
  if (existing) {
    return { privateKeyPem: existing.privateKeyPem, publicKeyPem: existing.publicKeyPem }
  }

  const fresh = generateKeyPair()
  try {
    await ActorKeyModel.create({ username, ...fresh })
    logger.info('activitypub actor keypair generated', { username })
    return fresh
  } catch (err) {
    // A concurrent boot may have inserted first (unique index → duplicate key).
    // Re-read the winning document so both processes converge on one key.
    const raced = await ActorKeyModel.findOne({ username }).lean()
    if (raced) {
      return { privateKeyPem: raced.privateKeyPem, publicKeyPem: raced.publicKeyPem }
    }
    throw err
  }
}
