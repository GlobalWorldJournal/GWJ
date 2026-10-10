import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Article, ArticleInput, Language } from '@gwj/shared-types';
import { CATEGORIES } from '@gwj/shared-types';
import { loadEnv, resetEnvCache, type Env } from '../../env';
import type { ActivityPubModule } from '../../activitypub';
import { mastodonChannel } from '../mastodonChannel';
import { telegramChannels } from '../telegramChannel';
import { startChannelPublishing } from '../registry';
import type { PublishChannel } from '../types';
import { articleService } from '../../services/articleService';
import { useTestDatabase, type TestDatabase } from '../../test/postgres';

const DOMAIN = 'globalworldjournal.com';

let testDb: TestDatabase;

/** A fabricated published-article DTO; override fields per test (Telegram/Mastodon unit tests). */
function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: 'a1',
    slug: 'markets-rally-today',
    title: 'Markets Rally',
    deck: 'Stocks surged on fresh optimism.',
    kicker: undefined,
    category: 'Markets',
    language: 'en',
    author: 'Eleanor Vance',
    body: '# Markets\n\nStrong session.',
    heroImage: undefined,
    status: 'published',
    featured: 0,
    tags: [],
    seo: {},
    source: undefined,
    publishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Build a validated Env with Telegram config controllable per test. */
function makeEnv(overrides: Record<string, string> = {}): Env {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '4000';
  process.env.DATABASE_URL = testDb.url;
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.ADMIN_USERNAME = 'nate';
  process.env.ADMIN_PASSWORD = 'super-secret-pw';
  process.env.AWS_REGION = 'us-east-1';
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;
  process.env.S3_BUCKET = 'test-bucket';
  process.env.CDN_BASE_URL = 'https://cdn.example.test';
  process.env.CORS_ORIGINS = '';
  process.env.FEDIVERSE_DOMAIN = DOMAIN;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHANNEL;
  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value;
  }
  resetEnvCache();
  return loadEnv();
}

/** A spy channel for registry tests. */
function spyChannel(
  name: string,
  opts: { enabled?: boolean; languages?: Language[] | 'all'; throws?: boolean } = {},
): PublishChannel & { calls: Article[] } {
  const calls: Article[] = [];
  const languages = opts.languages ?? 'all';
  return {
    name,
    platform: 'telegram',
    calls,
    servesLanguage: (lang) => languages === 'all' || languages.includes(lang),
    isEnabled: () => opts.enabled ?? true,
    async publish(article) {
      calls.push(article);
      if (opts.throws) throw new Error(`${name} boom`);
    },
  };
}

/** Create + publish an article so the article-published hook fires for real. */
async function publishArticle(overrides: Partial<ArticleInput> = {}): Promise<void> {
  const draft = await articleService.create({
    title: 'Markets Rally Today',
    category: CATEGORIES[2],
    language: 'en',
    author: 'Eleanor Vance',
    body: '# Markets\n\nStrong session **today**.',
    status: 'draft',
    featured: 0,
    tags: [],
    seo: {},
    ...overrides,
  });
  await articleService.publish(draft.id);
}

/** Let queued microtasks (the registry's best-effort fan-out) settle. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

beforeAll(async () => {
  testDb = await useTestDatabase();
});

beforeEach(async () => {
  await testDb.truncateAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await testDb.drop();
});

describe('channel registry routing', () => {
  it('fans out to every enabled channel that serves the language and skips disabled ones', async () => {
    const enabledAll = spyChannel('enabled-all', { enabled: true });
    const disabled = spyChannel('disabled', { enabled: false });
    const stop = startChannelPublishing([enabledAll, disabled]);

    await publishArticle({ language: 'en' });
    await flush();

    expect(enabledAll.calls).toHaveLength(1);
    expect(enabledAll.calls[0]?.language).toBe('en');
    expect(disabled.calls).toHaveLength(0);
    stop();
  });

  it('routes by language: only channels whose servesLanguage matches receive the article', async () => {
    const enOnly = spyChannel('en-only', { languages: ['en'] });
    const esOnly = spyChannel('es-only', { languages: ['es'] });
    const all = spyChannel('all', { languages: 'all' });
    const stop = startChannelPublishing([enOnly, esOnly, all]);

    await publishArticle({ title: 'English Story', language: 'en' });
    await publishArticle({ title: 'Spanish Story', language: 'es' });
    await flush();

    expect(enOnly.calls.map((a) => a.title)).toEqual(['English Story']);
    expect(esOnly.calls.map((a) => a.title)).toEqual(['Spanish Story']);
    expect(all.calls.map((a) => a.title).sort()).toEqual(['English Story', 'Spanish Story']);
    stop();
  });

  it('isolates a throwing channel: others still receive the article (allSettled)', async () => {
    const boom = spyChannel('boom', { throws: true });
    const ok = spyChannel('ok');
    const stop = startChannelPublishing([boom, ok]);

    await publishArticle({ title: 'Resilient Story' });
    await flush();

    expect(boom.calls).toHaveLength(1);
    expect(ok.calls).toHaveLength(1);
    expect(ok.calls[0]?.title).toBe('Resilient Story');
    stop();
  });

  it('stop() unsubscribes: no further fan-out after stopping', async () => {
    const ch = spyChannel('ch');
    const stop = startChannelPublishing([ch]);
    stop();

    await publishArticle({ title: 'After Stop' });
    await flush();

    expect(ch.calls).toHaveLength(0);
  });
});

describe('mastodon channel', () => {
  it('delegates publish to the AP module deliverArticle and serves all languages', async () => {
    const deliverArticle = vi
      .fn<(article: Article) => Promise<void>>()
      .mockResolvedValue(undefined);
    const apModule = { deliverArticle } as unknown as ActivityPubModule;
    const channel = mastodonChannel(apModule);

    expect(channel.platform).toBe('mastodon');
    expect(channel.isEnabled()).toBe(true);
    expect(channel.servesLanguage('en')).toBe(true);
    expect(channel.servesLanguage('es')).toBe(true);
    expect(channel.servesLanguage('fr')).toBe(true);

    const article = makeArticle({ language: 'es' });
    await channel.publish(article);
    expect(deliverArticle).toHaveBeenCalledTimes(1);
    expect(deliverArticle).toHaveBeenCalledWith(article);
  });
});

describe('telegram channel', () => {
  it('is disabled with no token: publish is a no-op and never fetches', async () => {
    const env = makeEnv({ TELEGRAM_BOT_TOKEN: '' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const tg = telegramChannels(env)[0];
    expect(tg).toBeDefined();
    if (!tg) return;

    expect(tg.isEnabled()).toBe(false);
    expect(tg.platform).toBe('telegram');
    expect(tg.servesLanguage('en')).toBe(true);
    expect(tg.servesLanguage('es')).toBe(false);

    await tg.publish(makeArticle());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('with a token + hero image: sends sendPhoto with the right chat_id, HTML caption and en URL', async () => {
    const env = makeEnv({ TELEGRAM_BOT_TOKEN: 'BOT123', TELEGRAM_CHANNEL: '@GWJOfficial' });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const tg = telegramChannels(env)[0];
    if (!tg) throw new Error('telegram channel missing');

    await tg.publish(
      makeArticle({
        language: 'en',
        slug: 'markets-rally-today',
        title: 'Markets <Rally> & Climb',
        deck: 'Stocks surged.',
        heroImage: { url: 'https://cdn.example.test/articles/hero.jpg', alt: 'floor' },
      }),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const call = fetchSpy.mock.calls[0];
    if (!call) throw new Error('fetch not called');
    const [url, init] = call;
    expect(String(url)).toBe('https://api.telegram.org/botBOT123/sendPhoto');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.chat_id).toBe('@GWJOfficial');
    expect(body.photo).toBe('https://cdn.example.test/articles/hero.jpg');
    expect(body.parse_mode).toBe('HTML');
    // Title is HTML-escaped and bolded; caption carries the en (no-prefix) apex URL.
    expect(body.caption).toContain('<b>Markets &lt;Rally&gt; &amp; Climb</b>');
    expect(body.caption).toContain('Stocks surged.');
    expect(body.caption).toContain(
      'Read: https://globalworldjournal.com/article/markets-rally-today',
    );
  });

  it('falls back to sendMessage when there is no hero image', async () => {
    const env = makeEnv({ TELEGRAM_BOT_TOKEN: 'BOT123' });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const tg = telegramChannels(env)[0];
    if (!tg) throw new Error('telegram channel missing');

    await tg.publish(makeArticle({ language: 'en', heroImage: undefined }));

    const call = fetchSpy.mock.calls[0];
    if (!call) throw new Error('fetch not called');
    const [url, init] = call;
    expect(String(url)).toBe('https://api.telegram.org/botBOT123/sendMessage');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.text).toContain('<b>Markets Rally</b>');
    expect(body.text).toContain('Read: https://globalworldjournal.com/article/markets-rally-today');
    expect(body.chat_id).toBe('@GWJOfficial');
    expect(body.photo).toBeUndefined();
  });

  it('does NOT post a non-English article to the English channel (and never fetches)', async () => {
    const env = makeEnv({ TELEGRAM_BOT_TOKEN: 'BOT123' });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const tg = telegramChannels(env)[0];
    if (!tg) throw new Error('telegram channel missing');

    await tg.publish(makeArticle({ language: 'es', slug: 'hola-mundo' }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('telegram channel — language routing through the registry', () => {
  it('an en article triggers a Telegram send; an es article does not', async () => {
    const env = makeEnv({ TELEGRAM_BOT_TOKEN: 'BOT123', TELEGRAM_CHANNEL: '@GWJOfficial' });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    // Only the Telegram channels (no Mastodon) so fetch calls map 1:1 to Telegram posts.
    const stop = startChannelPublishing(telegramChannels(env));

    await publishArticle({ title: 'English Story', language: 'en' });
    await publishArticle({ title: 'Spanish Story', language: 'es' });
    await flush();

    // Exactly one Telegram send — for the English article only.
    const telegramCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).startsWith('https://api.telegram.org/'),
    );
    expect(telegramCalls).toHaveLength(1);
    const init = telegramCalls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(init?.body));
    expect(body.caption ?? body.text).toContain('<b>English Story</b>');
    expect(body.caption ?? body.text).toContain(
      'Read: https://globalworldjournal.com/article/english-story',
    );
    stop();
  });
});
