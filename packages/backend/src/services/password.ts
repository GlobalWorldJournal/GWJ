/**
 * Password hashing on Bun's native bcrypt (`Bun.password`).
 *
 * bcrypt only ever reads the first 72 bytes of a password. Given a longer one,
 * `Bun.password` pre-hashes it with SHA-512 instead of truncating it, which
 * would stop every hash written by bcryptjs (which truncates) from verifying.
 * Handing it the first 72 UTF-8 bytes keeps the hashes byte-compatible with
 * bcryptjs in both directions.
 */
const BCRYPT_MAX_KEY_BYTES = 72;

/** Cost factor of every stored password hash. */
export const BCRYPT_COST = 12;

const encoder = new TextEncoder();

function bcryptKey(password: string): Uint8Array {
  return encoder.encode(password).subarray(0, BCRYPT_MAX_KEY_BYTES);
}

/** bcrypt-hash a password (`$2b$` format). */
export function hashPassword(password: string, cost: number = BCRYPT_COST): Promise<string> {
  return Bun.password.hash(bcryptKey(password), { algorithm: 'bcrypt', cost });
}

/** Check a password against a bcrypt hash (`$2a$` or `$2b$`). */
export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(bcryptKey(password), hash, 'bcrypt');
}
