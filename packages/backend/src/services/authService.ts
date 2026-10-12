import jwt, { type SignOptions } from 'jsonwebtoken';
import { type LoginResponse } from '@gwj/shared-types';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { users } from '../db/schema/users';
import { UnauthorizedError } from '../errors';
import { verifyPassword } from './password';

const TOKEN_TTL: SignOptions['expiresIn'] = '12h';
/**
 * Compared against when the username does not exist, so a login for an unknown
 * user costs the same bcrypt work as one with a wrong password: response time
 * never reveals which usernames exist. (The bcrypt hash of a random value nobody
 * knows; same cost factor as real password hashes.)
 */
const UNKNOWN_USER_HASH = '$2a$12$pp2OQReNU8JWMiY9FpCD5uS.Flsq/xYbfFgYEKGA8N1h3kmPmLqhi';

export interface AuthTokenPayload {
  sub: string;
  username: string;
  role: 'admin';
}

export interface AuthService {
  login(username: string, password: string, jwtSecret: string): Promise<LoginResponse>;
  verify(token: string, jwtSecret: string): AuthTokenPayload;
}

function isPayload(value: unknown): value is AuthTokenPayload {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.sub === 'string' && typeof v.username === 'string' && v.role === 'admin';
}

export const authService: AuthService = {
  async login(username, password, jwtSecret) {
    const [user] = await getDb().select().from(users).where(eq(users.username, username)).limit(1);
    const ok = await verifyPassword(password, user?.passwordHash ?? UNKNOWN_USER_HASH);
    if (!user || !ok) throw new UnauthorizedError('Invalid credentials');

    const payload: AuthTokenPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };
    const token = jwt.sign(payload, jwtSecret, { expiresIn: TOKEN_TTL });
    return { token, user: { username: user.username, role: 'admin' } };
  },

  verify(token, jwtSecret) {
    try {
      const decoded = jwt.verify(token, jwtSecret);
      if (!isPayload(decoded)) throw new UnauthorizedError('Invalid token payload');
      return decoded;
    } catch (err) {
      if (err instanceof UnauthorizedError) throw err;
      throw new UnauthorizedError('Invalid or expired token');
    }
  },
};
