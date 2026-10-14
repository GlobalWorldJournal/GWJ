import { INDEXNOW_ENDPOINT, INDEXNOW_KEY, articlePublicUrl, type Article } from '@gwj/shared-types';
import type { Env } from '../env';
import type { PublishChannel } from './types';

/** Abort an in-flight IndexNow request after this long so a hung call never lingers. */
const INDEXNOW_TIMEOUT_MS = 10_000;

/** A failed IndexNow submission (non-2xx reply, timeout, network). The outbox retries it. */
export class IndexNowError extends Error {
  constructor(message: string) {
    super(`indexnow: ${message}`);
    this.name = 'IndexNowError';
  }
}

/** What a delivered submission is recorded as: the URL that was announced. */
interface IndexNowRef {
  url: string;
}

function isIndexNowRef(ref: Record<string, unknown>): ref is Record<string, unknown> & IndexNowRef {
  return typeof ref.url === 'string';
}

/** Tell IndexNow that `url` was added, changed or removed. Rejects unless it answers 2xx. */
async function submit(domain: string, url: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: domain,
        key: INDEXNOW_KEY,
        keyLocation: `https://${domain}/${INDEXNOW_KEY}.txt`,
        urlList: [url],
      }),
      signal: AbortSignal.timeout(INDEXNOW_TIMEOUT_MS),
    });
  } catch (error) {
    throw new IndexNowError(error instanceof Error ? error.message : String(error));
  }
  if (!res.ok) throw new IndexNowError(`HTTP ${res.status} for ${url}`);
}

/**
 * Announce article changes to IndexNow so Bing, Yandex and the other
 * participating engines crawl them within minutes instead of days: a new
 * article, an edit, and a takedown (the URL now answers 404/410, which is
 * what the engines are told to re-check). Runs only in production — local and
 * test backends must never submit the live site's URLs.
 */
export function indexNowChannel(env: Env): PublishChannel {
  const domain = env.FEDIVERSE_DOMAIN;
  const urlOf = (article: Article) => articlePublicUrl(domain, article.language, article.slug);
  return {
    name: 'indexnow',
    platform: 'indexnow',
    servesLanguage: () => true,
    isEnabled: () => env.NODE_ENV === 'production',
    async publish(article) {
      const url = urlOf(article);
      await submit(domain, url);
      return { url };
    },
    async update(article, ref) {
      const url = urlOf(article);
      await submit(domain, url);
      // A changed slug leaves the old URL redirecting; announce it too.
      if (isIndexNowRef(ref) && ref.url !== url) await submit(domain, ref.url);
      return { url };
    },
    async retract(ref) {
      if (isIndexNowRef(ref)) await submit(domain, ref.url);
    },
  };
}
