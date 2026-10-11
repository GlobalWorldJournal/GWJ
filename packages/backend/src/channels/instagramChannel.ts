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

/** Facebook Graph API base — Instagram Business posting goes through the same API. */
const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

/** Abort an in-flight Graph API request after this long so a hung call never lingers. */
const INSTAGRAM_TIMEOUT_MS = 10_000;

/** How long to wait for a media container to finish fetching the image before publishing it. */
const CONTAINER_POLL_INTERVAL_MS = 1_500;
const CONTAINER_POLL_ATTEMPTS = 5;

/**
 * One Instagram Business account binding: a single edition (`language`)
 * delivered to one account, authorized by its LINKED Facebook Page's own
 * access token (the Instagram Graph API has no separate Instagram token — a
 * Business/Creator account is always managed through the Page it's connected
 * to). Reuses the same FACEBOOK_PAGE_TOKEN(_ES) env vars as facebookChannel.ts
 * rather than asking for a second, redundant token; only the account id is
 * Instagram's own.
 */
interface InstagramAccountConfig {
  readonly language: Language;
  resolveAccountId(env: Env): string | undefined;
  resolveToken(env: Env): string | undefined;
}

const INSTAGRAM_ACCOUNTS: readonly InstagramAccountConfig[] = [
  {
    language: 'en',
    resolveAccountId: (env) => env.INSTAGRAM_ACCOUNT_ID,
    resolveToken: (env) => env.FACEBOOK_PAGE_TOKEN,
  },
  {
    language: 'es',
    resolveAccountId: (env) => env.INSTAGRAM_ACCOUNT_ID_ES,
    resolveToken: (env) => env.FACEBOOK_PAGE_TOKEN_ES,
  },
];

/**
 * Build the caption: title, deck, then the canonical article URL. Instagram
 * never renders a caption's URL as a clickable link — it's included anyway as
 * a readable/copyable reference, the way most news accounts still do, not
 * because a reader can tap it.
 */
function buildCaption(article: Article, url: string): string {
  const lines = [article.title];
  const deck = article.deck?.trim();
  if (deck && deck.length > 0) lines.push(deck);
  lines.push(url);
  return lines.join('\n\n');
}

interface InstagramPostRef {
  mediaId: string;
}

const SETTLED_ERROR_CODES = new Set([100]); // "Unsupported post request" — usually a since-deleted object.

/** A failed Graph API call (non-OK reply, timeout, network, a container that never finished). */
export class InstagramError extends Error {
  constructor(
    readonly method: string,
    message: string,
  ) {
    super(`instagram ${method}: ${message}`);
    this.name = 'InstagramError';
  }
}

async function callGraph(
  path: string,
  token: string,
  method: 'GET' | 'POST' | 'DELETE',
  params: Record<string, string>,
): Promise<Record<string, unknown> | undefined> {
  const url = new URL(`${GRAPH_API_BASE}${path}`);
  url.searchParams.set('access_token', token);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  let res: Response;
  try {
    res = await fetch(url, { method, signal: AbortSignal.timeout(INSTAGRAM_TIMEOUT_MS) });
  } catch (err) {
    throw new InstagramError(path, err instanceof Error ? err.message : String(err));
  }
  const body = (await res.json().catch(() => undefined)) as Record<string, unknown> | undefined;
  if (res.ok) return body;
  const error = (body as { error?: { message?: string; code?: number } } | undefined)?.error;
  if (error?.code !== undefined && SETTLED_ERROR_CODES.has(error.code)) {
    logger.info('instagram: nothing left to do', { path, code: error.code });
    return undefined;
  }
  throw new InstagramError(path, `HTTP ${res.status} ${error?.message ?? ''}`.trim());
}

/**
 * Poll a freshly-created media container until Instagram has finished
 * fetching the image (`status_code: FINISHED`) or give up. Publishing a
 * container that's still `IN_PROGRESS` is a common, well-documented source of
 * failures in the Content Publishing API — most containers finish almost
 * immediately, but a slow CDN fetch can take a few seconds.
 */
async function waitUntilFinished(containerId: string, token: string): Promise<void> {
  for (let attempt = 0; attempt < CONTAINER_POLL_ATTEMPTS; attempt++) {
    const status = await callGraph(`/${containerId}`, token, 'GET', { fields: 'status_code' });
    const statusCode = status?.status_code;
    if (statusCode === 'FINISHED') return;
    if (statusCode === 'ERROR')
      throw new InstagramError('media', 'container failed to process the image');
    await new Promise((resolve) => setTimeout(resolve, CONTAINER_POLL_INTERVAL_MS));
  }
  // Not confirmed FINISHED after polling — try publishing anyway; Instagram
  // itself will reject it if it's genuinely not ready, and the job retries.
}

/**
 * Build one Instagram Business account channel from an
 * {@link InstagramAccountConfig} entry. Instagram has no text-only post, so an
 * article with no hero image is skipped for this channel, not an error.
 * Publishing is two calls: create a media container, then publish it.
 * There is no supported way to edit a published post's image or caption
 * through this API, so this channel has no `update` — a visible edit simply
 * leaves the Instagram post as originally posted, the same honest limitation
 * Telegram's own channel documents for its pre-edit-tracking posts.
 */
function buildInstagramChannel(env: Env, config: InstagramAccountConfig): PublishChannel {
  const accountId = config.resolveAccountId(env);
  const token = config.resolveToken(env);
  const { language } = config;

  return {
    name: `instagram:${language}`,
    platform: 'facebook', // Instagram posting rides the same Graph API/credentials as its linked Page.
    servesLanguage: (lang) => lang === language,
    isEnabled: () => Boolean(accountId && token),
    async publish(article: Article) {
      if (!accountId || !token) return;
      const articleLanguage = isLanguage(article.language) ? article.language : DEFAULT_LANGUAGE;
      if (articleLanguage !== language) return;
      if (!article.heroImage?.url) return; // No image, no Instagram post — nothing to skip to, it's a no-op.

      const caption = buildCaption(
        article,
        articlePublicUrl(env.FEDIVERSE_DOMAIN, language, article.slug),
      );
      const container = await callGraph(`/${accountId}/media`, token, 'POST', {
        image_url: article.heroImage.url,
        caption,
      });
      const containerId = container?.id as string | undefined;
      if (!containerId) throw new InstagramError('media', 'no container id in the reply');

      await waitUntilFinished(containerId, token);

      const published = await callGraph(`/${accountId}/media_publish`, token, 'POST', {
        creation_id: containerId,
      });
      const mediaId = published?.id as string | undefined;
      if (!mediaId) throw new InstagramError('media_publish', 'no media id in the reply');
      return { mediaId };
    },
    async retract(ref: Record<string, unknown>) {
      if (!token || typeof ref.mediaId !== 'string') return;
      const typedRef = ref as unknown as InstagramPostRef;
      await callGraph(`/${typedRef.mediaId}`, token, 'DELETE', {});
    },
  };
}

/**
 * Build every configured Instagram account channel (one per edition in
 * {@link INSTAGRAM_ACCOUNTS}). Each self-disables when its account id or
 * (shared, Page-level) token env var is absent.
 */
export function instagramChannels(env: Env): PublishChannel[] {
  return INSTAGRAM_ACCOUNTS.map((config) => buildInstagramChannel(env, config));
}
