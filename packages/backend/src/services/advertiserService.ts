import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import {
  AD_TERMS_VERSION,
  type Advertiser,
  type AdvertiserAuthResponse,
  type AdvertiserLoginInput,
  type AdvertiserRegisterInput,
} from '@gwj/shared-types';
import { getDb } from '../db/client';
import { newRecordId } from '../db/ids';
import { advertisers, type AdvertiserRow } from '../db/schema/advertisers';
import { ConflictError, UnauthorizedError } from '../errors';
import { hashPassword, verifyPassword } from './password';

const TOKEN_TTL = '7d';
/**
 * The JWT audience of an advertiser session. Admin tokens carry no audience and
 * `authService.verify` requires `role: 'admin'`, so neither kind of token is ever
 * accepted by the other side's middleware.
 */
export const ADVERTISER_JWT_AUDIENCE = 'gwj-advertiser';
const ADVERTISER_ROLE = 'advertiser';
/** Same role as the admin one: a login for an unknown email costs the same bcrypt work. */
const UNKNOWN_ADVERTISER_HASH = '$2a$12$pp2OQReNU8JWMiY9FpCD5uS.Flsq/xYbfFgYEKGA8N1h3kmPmLqhi';
const DUPLICATE_MESSAGE = 'We could not create an account with those details. Try signing in.';

export function advertiserToDTO(row: AdvertiserRow): Advertiser {
  return {
    id: row.id,
    email: row.email,
    companyName: row.companyName,
    createdAt: row.createdAt.toISOString(),
  };
}

function issueToken(row: AdvertiserRow, jwtSecret: string): string {
  return jwt.sign({ sub: row.id, role: ADVERTISER_ROLE }, jwtSecret, {
    expiresIn: TOKEN_TTL,
    audience: ADVERTISER_JWT_AUDIENCE,
  });
}

export interface AdvertiserService {
  register(input: AdvertiserRegisterInput, jwtSecret: string): Promise<AdvertiserAuthResponse>;
  login(input: AdvertiserLoginInput, jwtSecret: string): Promise<AdvertiserAuthResponse>;
  /** The advertiser a token names; throws 401 for any invalid/expired/foreign token. */
  authenticate(token: string, jwtSecret: string): Promise<AdvertiserRow>;
}

export const advertiserService: AdvertiserService = {
  async register(input, jwtSecret) {
    const now = new Date();
    const passwordHash = await hashPassword(input.password);
    const [row] = await getDb()
      .insert(advertisers)
      .values({
        id: newRecordId(now),
        email: input.email.toLowerCase(),
        passwordHash,
        companyName: input.companyName,
        termsVersion: AD_TERMS_VERSION,
        termsAcceptedAt: now,
        createdAt: now,
      })
      .onConflictDoNothing({ target: advertisers.email })
      .returning();
    if (!row) throw new ConflictError(DUPLICATE_MESSAGE);
    return { token: issueToken(row, jwtSecret), advertiser: advertiserToDTO(row) };
  },

  async login(input, jwtSecret) {
    const [row] = await getDb()
      .select()
      .from(advertisers)
      .where(eq(advertisers.email, input.email.toLowerCase()))
      .limit(1);
    const ok = await verifyPassword(input.password, row?.passwordHash ?? UNKNOWN_ADVERTISER_HASH);
    if (!row || !ok) throw new UnauthorizedError('Invalid credentials');
    return { token: issueToken(row, jwtSecret), advertiser: advertiserToDTO(row) };
  },

  async authenticate(token, jwtSecret) {
    let subject: string;
    try {
      const decoded = jwt.verify(token, jwtSecret, { audience: ADVERTISER_JWT_AUDIENCE });
      if (typeof decoded === 'string' || decoded.role !== ADVERTISER_ROLE || !decoded.sub)
        throw new UnauthorizedError('Invalid token payload');
      subject = decoded.sub;
    } catch (err) {
      if (err instanceof UnauthorizedError) throw err;
      throw new UnauthorizedError('Invalid or expired token');
    }
    const [row] = await getDb()
      .select()
      .from(advertisers)
      .where(eq(advertisers.id, subject))
      .limit(1);
    if (!row) throw new UnauthorizedError('Invalid or expired token');
    return row;
  },
};
