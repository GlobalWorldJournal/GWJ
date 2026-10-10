import { generateKeyPairSync } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { actorKeys } from '../db/schema/actorKeys'
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
 *  1. A persisted `actor_keys` row for this username, or
 *  2. Generate a new keypair and persist it (first use).
 *
 * Each actor (edition or writer) has its OWN keypair, so there are up to 21 rows.
 * Idempotent under races WITHOUT catching an error: `ON CONFLICT DO NOTHING`
 * returns no row when a concurrent boot inserted first, and we read the winner.
 * (A catch-all on the insert would also answer "already done" to a dropped
 * connection.)
 */
export async function resolveActorKeyPair(username: string): Promise<ActorKeyPair> {
  const db = getDb()
  const existing = await readKeyPair(username)
  if (existing) return existing

  const fresh = generateKeyPair()
  const now = new Date()
  const inserted = await db
    .insert(actorKeys)
    .values({ username, ...fresh, createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: actorKeys.username })
    .returning({ username: actorKeys.username })
  if (inserted.length > 0) {
    logger.info('activitypub actor keypair generated', { username })
    return fresh
  }
  const winner = await readKeyPair(username)
  if (!winner) throw new Error(`actor key for ${username} conflicted on insert but cannot be read back`)
  return winner
}

async function readKeyPair(username: string): Promise<ActorKeyPair | null> {
  const [row] = await getDb()
    .select({ privateKeyPem: actorKeys.privateKeyPem, publicKeyPem: actorKeys.publicKeyPem })
    .from(actorKeys)
    .where(eq(actorKeys.username, username))
    .limit(1)
  return row ?? null
}
