import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { INDEXNOW_ENDPOINT, INDEXNOW_KEY, type Article } from '@gwj/shared-types';
import type { Env } from '../../env';
import { IndexNowError, indexNowChannel } from '../indexNowChannel';

const DOMAIN = 'globalworldjournal.com';

function envOf(nodeEnv: Env['NODE_ENV']): Env {
  return { FEDIVERSE_DOMAIN: DOMAIN, NODE_ENV: nodeEnv } as Env;
}

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: 'a1',
    slug: 'markets-rally-today',
    title: 'Markets Rally',
    category: 'Markets',
    language: 'en',
    author: 'Eleanor Vance',
    body: 'Strong session.',
    ...overrides,
  } as Article;
}

const DELIVERY = { deliveryId: 1 };

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>;

function mockFetch(status = 200): void {
  fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status }));
}

function submitted(): Array<{ host: string; key: string; keyLocation: string; urlList: string[] }> {
  return fetchSpy.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

afterEach(() => fetchSpy?.mockRestore());

describe('indexNowChannel', () => {
  it('runs only in production and serves every edition', () => {
    expect(indexNowChannel(envOf('production')).isEnabled()).toBe(true);
    expect(indexNowChannel(envOf('development')).isEnabled()).toBe(false);
    expect(indexNowChannel(envOf('test')).isEnabled()).toBe(false);
    expect(indexNowChannel(envOf('production')).servesLanguage('fr')).toBe(true);
  });

  it('announces a published article with the key and where to verify it', async () => {
    mockFetch();
    const ref = await indexNowChannel(envOf('production')).publish(
      article({ language: 'es' }),
      DELIVERY,
    );
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(INDEXNOW_ENDPOINT);
    expect(submitted()).toEqual([
      {
        host: DOMAIN,
        key: INDEXNOW_KEY,
        keyLocation: `https://${DOMAIN}/${INDEXNOW_KEY}.txt`,
        urlList: [`https://${DOMAIN}/es/article/markets-rally-today`],
      },
    ]);
    expect(ref).toEqual({ url: `https://${DOMAIN}/es/article/markets-rally-today` });
  });

  it('announces both URLs when an edit changed the slug', async () => {
    mockFetch(202);
    const channel = indexNowChannel(envOf('production'));
    const next = await channel.update?.(article({ slug: 'new-slug' }), {
      url: `https://${DOMAIN}/article/old-slug`,
    });
    expect(submitted().map((s) => s.urlList[0])).toEqual([
      `https://${DOMAIN}/article/new-slug`,
      `https://${DOMAIN}/article/old-slug`,
    ]);
    expect(next).toEqual({ url: `https://${DOMAIN}/article/new-slug` });
  });

  it('announces the recorded URL on a takedown', async () => {
    mockFetch();
    await indexNowChannel(envOf('production')).retract?.({ url: `https://${DOMAIN}/article/gone` });
    expect(submitted().map((s) => s.urlList[0])).toEqual([`https://${DOMAIN}/article/gone`]);
  });

  it('rejects on a non-2xx reply so the outbox retries', async () => {
    mockFetch(429);
    await expect(indexNowChannel(envOf('production')).publish(article(), DELIVERY)).rejects.toThrow(
      IndexNowError,
    );
  });
});
