import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { API_SCOPES, type ApiScope } from '@gwj/shared-types';
import { RECORD_ID_SQL_PATTERN } from '../ids';
import { sqlTextArray } from '../sqlLiterals';

/**
 * Credentials for agents (the MCP server, automations): one token per agent,
 * with its own scopes, revocable on its own. Only the SHA-256 of the secret is
 * stored; the secret is shown once, when the token is created.
 */
export const apiTokens = pgTable(
  'api_tokens',
  {
    id: text().primaryKey(),
    name: text().notNull(),
    tokenHash: text().notNull(),
    scopes: text().array().$type<ApiScope[]>().notNull(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    lastUsedAt: timestamp({ withTimezone: true, mode: 'date' }),
    revokedAt: timestamp({ withTimezone: true, mode: 'date' }),
  },
  (t) => [
    unique('api_tokens_name_unique').on(t.name),
    unique('api_tokens_token_hash_unique').on(t.tokenHash),
    check('api_tokens_id_format', sql`${t.id} ~ ${sql.raw(`'${RECORD_ID_SQL_PATTERN}'`)}`),
    check('api_tokens_scopes_check', sql`${t.scopes} <@ ${sqlTextArray(API_SCOPES)}`),
  ],
);

export type ApiTokenRow = typeof apiTokens.$inferSelect;
