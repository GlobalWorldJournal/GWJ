import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { mentionOauth, type MentionOauthRow } from '../db/schema/mentionOauth';
import { open, seal } from '../services/secretSeal';
import type { Env } from '../env';
import { logger, errorFields } from '../logger';

/** The one grant this service manages — a single row, same shape Herald's own (multi-resource) design uses for an identical job. */
const RESOURCE = 'mention';
/** The protected resource this grant is for — baked into both the authorize and every refresh request (RFC 8707). */
const RESOURCE_URI = 'https://mcp.mention.earth';
/**
 * Scopes GWJ actually needs: post as @gwj, retract a post when an article is
 * unpublished or deleted, and read enough to confirm which account a grant
 * is for. Intersected with whatever the resource actually advertises.
 *
 * `social.posts.delete` was missing on the first live authorization —
 * confirmed live: publishing worked on the first real test, but retracting
 * that same test post failed with "This tool requires: social.posts.delete."
 * Scopes are fixed at authorization time, so this fix alone doesn't widen
 * the grant already stored; re-authorizing (Dashboard's "Connect Mention")
 * does.
 */
const WANTED_SCOPES = ['social.accounts.read', 'social.posts.publish', 'social.posts.delete'];
/** Refresh this long before expiry, so a token already in flight never lapses mid-call. */
const EXPIRY_MARGIN_MS = 120_000;

function redirectUri(env: Env): string {
  return `${env.MENTION_REDIRECT_BASE_URL}/api/mention/callback`;
}

interface ServerMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

async function json<T>(res: Response, what: string): Promise<T> {
  const text = await res.text();
  if (!res.ok) throw new Error(`${what} failed (${res.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

async function discover(): Promise<{ server: ServerMetadata; scopes: string[] }> {
  const origin = new URL(RESOURCE_URI).origin;
  const meta = await json<{ authorization_servers: string[]; scopes_supported?: string[] }>(
    await fetch(`${origin}/.well-known/oauth-protected-resource`),
    'protected resource metadata',
  );
  const issuer = meta.authorization_servers[0];
  if (!issuer) throw new Error(`${RESOURCE_URI} names no authorization server`);
  const server = await json<ServerMetadata>(
    await fetch(`${issuer}/.well-known/oauth-authorization-server`),
    'authorization server metadata',
  );
  const advertised = new Set(meta.scopes_supported ?? WANTED_SCOPES);
  return { server, scopes: WANTED_SCOPES.filter((s) => advertised.has(s)) };
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

/**
 * The PKCE verifier and where to exchange the code, folded into the `state`
 * param itself (sealed) rather than a server-side pending-authorization row:
 * Mention's authorization server echoes `state` back verbatim, so the
 * callback can recover everything it needs from that one value alone — no
 * extra table, no cleanup job for abandoned attempts.
 */
interface PendingState {
  verifier: string;
  clientId: string;
  tokenEndpoint: string;
}

export interface BeginAuthorizationResult {
  /** Open this in a browser signed in as @gwj, then approve it. */
  url: string;
}

/**
 * Starts the one-time authorization: registers a fresh OAuth client (dynamic
 * client registration — no client secret to provision ahead of time) and
 * returns the URL an admin opens, signed in as @gwj, to grant it. Call this
 * again any time (e.g. after a genuine revocation) to re-authorize; it never
 * reuses a previous registration.
 */
export async function beginAuthorization(env: Env): Promise<BeginAuthorizationResult> {
  const { server, scopes } = await discover();
  const client = await json<{ client_id: string }>(
    await fetch(server.registration_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Global World Journal (Mention channel)',
        redirect_uris: [redirectUri(env)],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: scopes.join(' '),
      }),
    }),
    'client registration',
  );

  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
  );
  const pending: PendingState = {
    verifier,
    clientId: client.client_id,
    tokenEndpoint: server.token_endpoint,
  };
  const state = await seal(env, JSON.stringify(pending));

  const url = new URL(server.authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: client.client_id,
    redirect_uri: redirectUri(env),
    scope: scopes.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: RESOURCE_URI,
  }).toString();

  return { url: url.toString() };
}

/**
 * Finishes the authorization: exchanges the code Mention's redirect carried
 * for a token pair, using the verifier/clientId/tokenEndpoint recovered from
 * `state`, and stores the grant (sealed). Throws if the grant came without a
 * refresh token — that would silently degrade to a 15-minute-only channel,
 * exactly the "works almost always" failure this exists to rule out.
 */
export async function completeAuthorization(env: Env, code: string, state: string): Promise<void> {
  const pending = JSON.parse(await open(env, state)) as PendingState;
  const tokens = await json<TokenResponse>(
    await fetch(pending.tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri(env),
        client_id: pending.clientId,
        code_verifier: pending.verifier,
        resource: RESOURCE_URI,
      }),
    }),
    'code exchange',
  );
  if (!tokens.refresh_token) throw new Error('the grant came without a refresh token');
  await store(env, pending.clientId, pending.tokenEndpoint, {
    ...tokens,
    refresh_token: tokens.refresh_token,
  });
  grantCached = true; // this process need not wait out GRANT_CACHE_INTERVAL_MS to notice its own write
}

async function store(
  env: Env,
  clientId: string,
  tokenEndpoint: string,
  tokens: Omit<TokenResponse, 'refresh_token'> & { refresh_token: string },
): Promise<void> {
  const sealedAccessToken = await seal(env, tokens.access_token);
  const sealedRefreshToken = await seal(env, tokens.refresh_token);
  const accessExpiresAt = Date.now() + tokens.expires_in * 1000;
  await getDb()
    .insert(mentionOauth)
    .values({
      resource: RESOURCE,
      clientId,
      tokenEndpoint,
      scopes: tokens.scope ?? '',
      accessToken: sealedAccessToken,
      accessExpiresAt,
      refreshToken: sealedRefreshToken,
      refreshClaimedAt: null,
      refreshFailCount: 0,
      refreshFailAt: null,
    })
    .onConflictDoUpdate({
      target: mentionOauth.resource,
      set: {
        clientId,
        tokenEndpoint,
        scopes: tokens.scope ?? '',
        accessToken: sealedAccessToken,
        accessExpiresAt,
        refreshToken: sealedRefreshToken,
        refreshClaimedAt: null,
        refreshFailCount: 0,
        refreshFailAt: null,
        updatedAt: new Date(),
      },
    });
}

/**
 * Whether a grant has been stored at all. A plain DB lookup — not what
 * `mentionChannel`'s `isEnabled()` calls directly, since the registry calls
 * `isEnabled()` synchronously inside the transaction that queues each
 * article's delivery jobs (`registry.ts`'s `planDeliveries`). See the cache
 * below.
 */
export async function hasGrant(): Promise<boolean> {
  const [row] = await getDb()
    .select({ resource: mentionOauth.resource })
    .from(mentionOauth)
    .where(eq(mentionOauth.resource, RESOURCE))
    .limit(1);
  return Boolean(row);
}

async function readRow(): Promise<MentionOauthRow> {
  const [row] = await getDb()
    .select()
    .from(mentionOauth)
    .where(eq(mentionOauth.resource, RESOURCE))
    .limit(1);
  if (!row) {
    throw new Error(
      'not authorized for Mention — visit /api/admin/mention/connect and approve as @gwj',
    );
  }
  return row;
}

/** How long to wait before trying again, given how many refreshes in a row have already failed. 0 once that wait has elapsed. */
function backoffRemainingMs(row: MentionOauthRow, timing: ClaimTiming): number {
  if (!row.refreshFailCount) return 0;
  const wait = Math.min(2 ** row.refreshFailCount * timing.backoffBaseMs, timing.backoffCapMs);
  return Math.max(0, wait - (Date.now() - (row.refreshFailAt ?? 0)));
}

/** How long a claim is honoured, how long another process waits one out, and how backoff grows after failures — overridable so tests don't wait for real. */
export interface ClaimTiming {
  /** A claim older than this is treated as abandoned — whoever held it crashed mid-refresh instead of clearing it. */
  staleMs: number;
  /** Waited out this many times, this long each, before giving up on someone else's claim. */
  attempts: number;
  waitMs: number;
  /** Backoff after N consecutive failures: min(2**N * backoffBaseMs, backoffCapMs). */
  backoffBaseMs: number;
  backoffCapMs: number;
}
const DEFAULT_CLAIM_TIMING: ClaimTiming = {
  staleMs: 20_000,
  attempts: 6,
  waitMs: 4_000,
  backoffBaseMs: 30_000,
  backoffCapMs: 20 * 60_000,
};

/**
 * Atomically claims the right to refresh the grant right now, or reports that
 * someone else already holds it. This is what an in-process lock alone can't
 * be: GWJ's backend runs several concurrent replicas sharing this one
 * database row, and the single-use refresh token must never be presented
 * twice at once — claimed via a plain `UPDATE ... RETURNING`, the only thing
 * every replica actually shares. A claim older than `staleMs` is up for
 * grabs again, in case whoever held it crashed mid-refresh instead of
 * clearing it.
 */
async function claimRefresh(timing: ClaimTiming): Promise<boolean> {
  const now = Date.now();
  const claimed = await getDb()
    .update(mentionOauth)
    .set({ refreshClaimedAt: now })
    .where(
      and(
        eq(mentionOauth.resource, RESOURCE),
        or(
          isNull(mentionOauth.refreshClaimedAt),
          lt(mentionOauth.refreshClaimedAt, now - timing.staleMs),
        ),
      ),
    )
    .returning({ resource: mentionOauth.resource });
  return claimed.length === 1;
}

async function recordRefreshFailure(): Promise<void> {
  await getDb()
    .update(mentionOauth)
    .set({
      refreshFailCount: sql`${mentionOauth.refreshFailCount} + 1`,
      refreshFailAt: Date.now(),
      refreshClaimedAt: null,
    })
    .where(eq(mentionOauth.resource, RESOURCE));
}

const refreshing = new Map<string, Promise<string>>();

/**
 * A valid access token for Mention, refreshing when it is about to expire.
 * Guarded three ways, same as Herald's proven implementation of this exact
 * grant: an in-memory lock coalesces concurrent calls within this one
 * process; the database claim above stops a second REPLICA from ever
 * presenting the same single-use refresh token; and a failure backs off
 * rather than retrying on the very next publish that needs a token, since an
 * attempt against an auth server that's itself down (a 503, a dropped
 * connection) is a chance it actually processed the refresh and only the
 * response was lost — indistinguishable, to Mention, from the token having
 * been stolen and reused, so it revokes the grant exactly the same way.
 */
export async function accessToken(
  env: Env,
  timing: ClaimTiming = DEFAULT_CLAIM_TIMING,
): Promise<string> {
  let row = await readRow();
  if (row.accessExpiresAt - EXPIRY_MARGIN_MS > Date.now()) return open(env, row.accessToken);

  const inFlight = refreshing.get(RESOURCE);
  if (inFlight) return inFlight;
  const refresh = (async () => {
    row = await readRow();
    if (row.accessExpiresAt - EXPIRY_MARGIN_MS > Date.now()) return open(env, row.accessToken);
    const remaining = backoffRemainingMs(row, timing);
    if (remaining > 0) {
      throw new Error(
        `mention: backing off after ${row.refreshFailCount} failed refreshes in a row; retrying in ${Math.ceil(remaining / 1000)}s`,
      );
    }

    for (let attempt = 0; ; attempt++) {
      row = await readRow();
      if (row.accessExpiresAt - EXPIRY_MARGIN_MS > Date.now()) return open(env, row.accessToken);
      if (await claimRefresh(timing)) break;
      if (attempt >= timing.attempts) {
        throw new Error('mention: another process has been refreshing this grant for too long');
      }
      await new Promise((r) => setTimeout(r, timing.waitMs));
    }
    try {
      const tokens = await json<TokenResponse>(
        await fetch(row.tokenEndpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: await open(env, row.refreshToken),
            client_id: row.clientId,
            resource: RESOURCE_URI,
          }),
        }),
        'refreshing the mention grant (if it was revoked, visit /api/admin/mention/connect again)',
      );
      await store(env, row.clientId, row.tokenEndpoint, {
        ...tokens,
        refresh_token: tokens.refresh_token ?? (await open(env, row.refreshToken)),
      });
      return tokens.access_token;
    } catch (error) {
      await recordRefreshFailure();
      logger.error('mention: token refresh failed', errorFields(error));
      throw error;
    }
  })().finally(() => refreshing.delete(RESOURCE));
  refreshing.set(RESOURCE, refresh);
  return refresh;
}

/**
 * Whether a grant is stored, cached in-process so `mentionChannel`'s
 * `isEnabled()` can answer synchronously (the registry calls it inside the
 * DB transaction that queues each article's delivery jobs — no `await`
 * there). Starts `false` until the first refresh completes, which is a
 * harmless few hundred milliseconds of "disabled" right after boot, not a
 * standing risk — self-heals every {@link GRANT_CACHE_INTERVAL_MS} after
 * that, and flips to `true` immediately on this same process completing a
 * fresh authorization (no need to wait out the interval).
 */
let grantCached = false;
export function isGrantCached(): boolean {
  return grantCached;
}

const GRANT_CACHE_INTERVAL_MS = 60_000;

/** Starts the periodic cache refresh; returns a stop function for graceful shutdown (and test teardown). */
export function startMentionGrantCache(): () => void {
  const refresh = async (): Promise<void> => {
    try {
      grantCached = await hasGrant();
    } catch (error) {
      logger.error('mention: grant cache refresh failed', errorFields(error));
    }
  };
  void refresh();
  const timer = setInterval(() => void refresh(), GRANT_CACHE_INTERVAL_MS);
  return () => clearInterval(timer);
}
