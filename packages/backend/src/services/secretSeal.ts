import type { Env } from '../env';

/**
 * AES-256-GCM sealing for a secret that must live in the database rather than
 * SSM — a value this process itself mints and rotates at runtime (Mention's
 * single-use refresh token), unlike every other channel's static token, which
 * a human sets once in SSM out of band. Keyed by `MENTION_OAUTH_SEAL_KEY` (32
 * random bytes, base64) so the database alone is never enough to post as
 * @gwj. Same scheme Herald already runs in production for the identical grant
 * (`~/herald/src/secrets.ts`).
 */
async function sealKey(env: Env): Promise<CryptoKey> {
  const secret = env.MENTION_OAUTH_SEAL_KEY;
  if (!secret) throw new Error('MENTION_OAUTH_SEAL_KEY is not set');
  const raw = Buffer.from(secret, 'base64');
  if (raw.length !== 32) {
    throw new Error('MENTION_OAUTH_SEAL_KEY must decode to exactly 32 bytes (base64)');
  }
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(env: Env, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await sealKey(env),
    new TextEncoder().encode(plain),
  );
  return `${Buffer.from(iv).toString('base64')}.${Buffer.from(cipher).toString('base64')}`;
}

export async function open(env: Env, sealed: string): Promise<string> {
  const [iv, cipher] = sealed.split('.');
  if (!iv || !cipher) throw new Error('sealed value is malformed');
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: Buffer.from(iv, 'base64') },
    await sealKey(env),
    Buffer.from(cipher, 'base64'),
  );
  return new TextDecoder().decode(plain);
}
