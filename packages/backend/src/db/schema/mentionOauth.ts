import { bigint, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * The single stored OAuth grant for GWJ's own Mention account (@gwj), used by
 * the Mention distribution channel to post without a human in the loop. One
 * row (`resource` fixed to `'mention'`) — the same grant shape Herald already
 * runs live for an identical job (Mention's own MCP OAuth: dynamic client
 * registration, PKCE, a single-use rotating refresh token), ported here
 * rather than reinvented; see `channels/mentionOauthService.ts`.
 *
 * `accessToken`/`refreshToken` are sealed (AES-256-GCM, `services/secretSeal.ts`)
 * before they ever reach a row: a refresh token is a standing grant to post as
 * @gwj, so the database alone must not be enough to use it.
 *
 * `refreshClaimedAt`/`refreshFailCount`/`refreshFailAt` exist only to make the
 * single-use refresh safe across GWJ's own several concurrent backend
 * replicas: whichever replica's `UPDATE ... WHERE refreshClaimedAt IS NULL OR
 * refreshClaimedAt < $staleBefore` actually matches a row is the one allowed
 * to refresh, so the one-use token is never presented twice at once.
 */
export const mentionOauth = pgTable('mention_oauth', {
  resource: text().primaryKey(),
  clientId: text().notNull(),
  tokenEndpoint: text().notNull(),
  scopes: text().notNull().default(''),
  accessToken: text().notNull(),
  accessExpiresAt: bigint({ mode: 'number' }).notNull(),
  refreshToken: text().notNull(),
  refreshClaimedAt: bigint({ mode: 'number' }),
  refreshFailCount: integer().notNull().default(0),
  refreshFailAt: bigint({ mode: 'number' }),
  updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type MentionOauthRow = typeof mentionOauth.$inferSelect;
