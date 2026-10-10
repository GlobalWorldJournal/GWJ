import bcrypt from 'bcryptjs';

/** bcrypt work factor for every stored password. */
export const BCRYPT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}
