import {
  DEFAULT_LANGUAGE,
  articlePublicUrl,
  isLanguage,
  type Article,
  type Language,
} from '@gwj/shared-types';
import type { Env } from '../env';
import { logger } from '../logger';
import type { PublishChannel } from './types';

/** Facebook Graph API base. Bump the version here when it's deprecated. */
const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

/** Abort an in-flight Graph API request after this long so a hung call never lingers. */
const FACEBOOK_TIMEOUT_MS = 10_000;

/**
 * One Facebook Page binding: a single edition (`language`) delivered to one
 * Page, authorized by that Page's OWN access token — unlike Telegram's one bot
 * across channels, a Facebook Page Access Token is minted per Page, so each
 * edition needs its own id + token pair, both read from `env`.
 *
 * This is DATA, not code: adding a language is a new entry here (plus its
 * FACEBOOK_PAGE_ID_<LANG>/FACEBOOK_PAGE_TOKEN_<LANG> env vars on the schema).
 * English and Spanish are configured today.
 */
interface FacebookPageConfig {
  readonly language: Language;
  resolvePageId(env: Env): string | undefined;
  resolveToken(env: Env): string | undefined;
}

const FACEBOOK_PAGES: readonly FacebookPageConfig[] = [
  {
    language: 'en',
    resolvePageId: (env) => env.FACEBOOK_PAGE_ID,
    resolveToken: (env) => env.FACEBOOK_PAGE_TOKEN,
  },
  {
    language: 'es',
    resolvePageId: (env) => env.FACEBOOK_PAGE_ID_ES,
    resolveToken: (env) => env.FACEBOOK_PAGE_TOKEN_ES,
  },
];

/** Build the post text: title, deck, then the canonical article URL. */
function buildMessage(article: Article, url: string): string {
  const lines = [article.title];
  const deck = article.deck?.trim();
  if (deck && deck.length > 0) lines.push(deck);
  lines.push(url);
  return lines.join('\n\n');
}

/** What a delivered post is recorded as: enough to edit or delete it later. */
interface FacebookPostRef {
  postId: string;
}

/** Graph API refusals that mean the work is already done (the post is already gone). */
const SETTLED_ERROR_CODES = new Set([100]); // "Unsupported post request" — usually a since-deleted object.

/** A failed Graph API call (non-OK reply, timeout, network). The outbox retries it. */
export class FacebookError extends Error {
  constructor(
    readonly method: string,
    message: string,
  ) {
    super(`facebook ${method}: ${message}`);
    this.name = 'FacebookError';
  }
}

/**
 * POST to a Graph API edge with an access token and resolve its JSON body — or
 * `undefined` when Facebook answers with a {@link SETTLED_ERROR_CODES} refusal.
 * Rejects with a {@link FacebookError} on any other failure so the distribution
 * job is retried.
 */
async function callGraph(
  path: string,
  token: string,
  method: 'POST' | 'DELETE',
  params: Record<string, string>,
): Promise<Record<string, unknown> | undefined> {
  const url = new URL(`${GRAPH_API_BASE}${path}`);
  url.searchParams.set('access_token', token);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  let res: Response;
  try {
    res = await fetch(url, { method, signal: AbortSignal.timeout(FACEBOOK_TIMEOUT_MS) });
  } catch (err) {
    throw new FacebookError(path, err instanceof Error ? err.message : String(err));
  }
  const body = (await res.json().catch(() => undefined)) as
    | { error?: { message?: string; code?: number } }
    | Record<string, unknown>
    | undefined;
  if (res.ok) return body as Record<string, unknown>;
  const error = (body as { error?: { message?: string; code?: number } } | undefined)?.error;
  if (error?.code !== undefined && SETTLED_ERROR_CODES.has(error.code)) {
    logger.info('facebook: nothing left to do', { path, code: error.code });
    return undefined;
  }
  throw new FacebookError(path, `HTTP ${res.status} ${error?.message ?? ''}`.trim());
}

function isFacebookRef(
  ref: Record<string, unknown>,
): ref is Record<string, unknown> & FacebookPostRef {
  return typeof ref.postId === 'string';
}

/**
 * Build one Facebook Page distribution channel from a {@link FacebookPageConfig}
 * entry. With a hero image the post goes to `/{page-id}/photos` (Facebook
 * fetches the CDN URL); without one, `/{page-id}/feed`. An update rewrites the
 * post's own `message` in place (Facebook does not support replacing an
 * already-published photo); a retraction deletes it.
 */
function buildFacebookChannel(env: Env, config: FacebookPageConfig): PublishChannel {
  const pageId = config.resolvePageId(env);
  const token = config.resolveToken(env);
  const { language } = config;

  const messageFor = (article: Article): string =>
    buildMessage(article, articlePublicUrl(env.FEDIVERSE_DOMAIN, language, article.slug));

  return {
    name: `facebook:${language}`,
    platform: 'facebook',
    servesLanguage: (lang) => lang === language,
    isEnabled: () => Boolean(pageId && token),
    async publish(article: Article) {
      if (!pageId || !token) return;
      const articleLanguage = isLanguage(article.language) ? article.language : DEFAULT_LANGUAGE;
      if (articleLanguage !== language) return;

      const message = messageFor(article);
      const result = article.heroImage?.url
        ? await callGraph(`/${pageId}/photos`, token, 'POST', {
            url: article.heroImage.url,
            caption: message,
          })
        : await callGraph(`/${pageId}/feed`, token, 'POST', { message });

      // A photo post's own id differs from its feed post_id; the feed post_id is
      // what update/retract operate on either way.
      const postId = (result?.post_id as string | undefined) ?? (result?.id as string | undefined);
      if (!postId) throw new FacebookError('publish', 'no post id in the reply');
      return { postId };
    },
    async update(article: Article, ref: Record<string, unknown>) {
      if (!token || !isFacebookRef(ref)) return;
      await callGraph(`/${ref.postId}`, token, 'POST', { message: messageFor(article) });
    },
    async retract(ref: Record<string, unknown>) {
      if (!token || !isFacebookRef(ref)) return;
      await callGraph(`/${ref.postId}`, token, 'DELETE', {});
    },
  };
}

/**
 * Build every configured Facebook Page channel (one per edition in
 * {@link FACEBOOK_PAGES}). Each self-disables when its page id or token env
 * var is absent.
 */
export function facebookChannels(env: Env): PublishChannel[] {
  return FACEBOOK_PAGES.map((config) => buildFacebookChannel(env, config));
}
