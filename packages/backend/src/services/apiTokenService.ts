import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import type { ApiToken, CreateApiTokenInput, CreatedApiToken } from '@gwj/shared-types';
import { getDb } from '../db/client';
import { isRecordId, newRecordId } from '../db/ids';
import { apiTokens, type ApiTokenRow } from '../db/schema/apiTokens';
import { NotFoundError } from '../errors';
import type { Principal } from '../auth/principal';

/** Every token starts with this, so it is recognisable (and scannable in leaks). */
export const API_TOKEN_PREFIX = 'gwj_';
const TOKEN_BYTES = 32;
/** last_used_at is refreshed at most this often, not on every request. */
const LAST_USED_GRANULARITY_MS = 60_000;

function hashToken(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function toApiToken(row: ApiTokenRow): ApiToken {
  return {
    id: row.id,
    name: row.name,
    scopes: row.scopes,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}

export const apiTokenService = {
  /** Mint a token. The secret is returned this once; only its hash is stored. */
  async create(input: CreateApiTokenInput): Promise<CreatedApiToken> {
    const token = `${API_TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString('base64url')}`;
    const [row] = await getDb()
      .insert(apiTokens)
      .values({
        id: newRecordId(),
        name: input.name,
        tokenHash: hashToken(token),
        scopes: input.scopes,
      })
      .returning();
    if (!row) throw new Error('insert into api_tokens returned no row');
    return { ...toApiToken(row), token };
  },

  async list(): Promise<ApiToken[]> {
    const rows = await getDb().select().from(apiTokens).orderBy(apiTokens.createdAt);
    return rows.map(toApiToken);
  },

  /** Revoke for good: the token stops working on the next request. */
  async revoke(id: string): Promise<ApiToken> {
    const [row] = isRecordId(id)
      ? await getDb()
          .update(apiTokens)
          .set({ revokedAt: new Date() })
          .where(and(eq(apiTokens.id, id), isNull(apiTokens.revokedAt)))
          .returning()
      : [];
    if (!row) throw new NotFoundError('No active token with that id');
    return toApiToken(row);
  },

  /** The agent a presented secret belongs to, or null (unknown or revoked). */
  async authenticate(secret: string): Promise<Principal | null> {
    if (!secret.startsWith(API_TOKEN_PREFIX)) return null;
    const db = getDb();
    const [row] = await db
      .select()
      .from(apiTokens)
      .where(and(eq(apiTokens.tokenHash, hashToken(secret)), isNull(apiTokens.revokedAt)))
      .limit(1);
    if (!row) return null;
    const now = new Date();
    await db
      .update(apiTokens)
      .set({ lastUsedAt: now })
      .where(
        and(
          eq(apiTokens.id, row.id),
          or(
            isNull(apiTokens.lastUsedAt),
            lt(apiTokens.lastUsedAt, new Date(now.getTime() - LAST_USED_GRANULARITY_MS)),
          ),
        ),
      );
    return { kind: 'agent', tokenId: row.id, name: row.name, scopes: row.scopes };
  },
};
