import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'bun:test';
import type { Article, ArticleInput, Language } from '@gwj/shared-types';
import { CATEGORIES } from '@gwj/shared-types';
import { loadEnv, resetEnvCache, type Env } from '../../env';
import type { ActivityPubModule } from '../../activitypub';
import { mastodonChannel } from '../mastodonChannel';
import { telegramChannels } from '../telegramChannel';
import { registerChannels } from '../registry';
import { channelPostsFor, recordChannelPost } from '../channelPosts';
import { claimDueJobs, enqueueJobs, jobsFor } from '../jobRepository';
import { backoffMs, MAX_ATTEMPTS, processDueJobs, startOutboxWorker } from '../outbox';
import type { PublishChannel } from '../types';
import { articleService } from '../../services/articleService';
import { getDb } from '../../db/client';
import { useTestDatabase, type TestDatabase } from '../../test/postgres';

const DOMAIN = 'globalworldjournal.com';
/** Telegram's reply to a successful send: the message it posted. */
function sentReply(): Response {
  return new Response(JSON.stringify({ ok: true, result: { message_id: 1, chat: { id: -1 } } }), {
    status: 200,
  });
}

/** The Telegram API calls a fetch spy saw: method name and JSON body. */
function sentCalls(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.map(([url, init]) => ({
    method: String(url).split('/').pop(),
    body: JSON.parse(String((init as RequestInit).body)),
  }));
}

/** The delivery context of a direct channel call (no outbox job behind it). */
const DELIVERY = { deliveryId: 1 };

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
  delete process.env.TELEGRAM_CHANNEL_ES;
  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value;
  }
  resetEnvCache();
  return loadEnv();
}

interface SpyChannel extends PublishChannel {
  published: Article[];
  updated: { article: Article; ref: Record<string, unknown> }[];
  retracted: Record<string, unknown>[];
  deliveryIds: number[];
}

/** A recording channel; `failPublish` makes its first N publishes reject. */
function spyChannel(
  name: string,
  opts: {
    enabled?: boolean;
    languages?: Language[] | 'all';
    failPublish?: number;
    ref?: Record<string, unknown>;
    canUpdate?: boolean;
  } = {},
): SpyChannel {
  const languages = opts.languages ?? 'all';
  let failures = opts.failPublish ?? 0;
  const channel: SpyChannel = {
    name,
    platform: 'telegram',
    published: [],
    updated: [],
    retracted: [],
    deliveryIds: [],
    servesLanguage: (lang) => languages === 'all' || languages.includes(lang),
    isEnabled: () => opts.enabled ?? true,
    async publish(article, { deliveryId }) {
      channel.published.push(article);
      channel.deliveryIds.push(deliveryId);
      if (failures > 0) {
        failures -= 1;
        throw new Error(`${name} boom`);
      }
      return opts.ref;
    },
    async retract(ref) {
      channel.retracted.push(ref);
    },
  };
  if (opts.canUpdate !== false) {
    channel.update = async (article, ref) => {
      channel.updated.push({ article, ref });
    };
  }
  return channel;
}

/** Create + publish an article through the service (which queues its distribution). */
async function publishArticle(overrides: Partial<ArticleInput> = {}): Promise<Article> {
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
  return articleService.publish(draft.id);
}

/** Work the outbox until nothing is due at `now` (later jobs wait for earlier ones). */
async function drain(channels: readonly PublishChannel[], now: Date = new Date()): Promise<void> {
  for (let pass = 0; pass < 20; pass += 1) {
    if ((await processDueJobs(channels, now)) === 0) return;
  }
  throw new Error('outbox did not drain');
}

const summary = (jobs: Awaited<ReturnType<typeof jobsFor>>) =>
  jobs.map((job) => `${job.channel}:${job.action}:${job.status}`);

let unregister: () => void = () => undefined;

/** A `globalThis.fetch` stand-in that answers every call with a fresh `respond()`. */
function fetchAnswering(respond: () => Response): typeof fetch {
  return Object.assign(async () => respond(), { preconnect: fetch.preconnect });
}

const WAIT_FOR_TIMEOUT_MS = 1_000;
const WAIT_FOR_INTERVAL_MS = 50;

/** Retry `assertion` until it passes or the timeout runs out (vitest's `vi.waitFor`). */
async function waitFor(assertion: () => void): Promise<void> {
  const deadline = Date.now() + WAIT_FOR_TIMEOUT_MS;
  for (;;) {
    try {
      assertion();
      return;
    } catch (err) {
      if (Date.now() >= deadline) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_INTERVAL_MS));
  }
}

beforeAll(async () => {
  testDb = await useTestDatabase();
});

beforeEach(async () => {
  await testDb.truncateAll();
});

afterEach(() => {
  unregister();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await testDb.drop();
});

describe('distribution planning', () => {
  it('queues a job per enabled channel serving the edition, in the publish transaction', async () => {
    const all = spyChannel('all');
    const enOnly = spyChannel('en-only', { languages: ['en'] });
    const esOnly = spyChannel('es-only', { languages: ['es'] });
    const disabled = spyChannel('disabled', { enabled: false });
    unregister = registerChannels([all, enOnly, esOnly, disabled]);

    const article = await publishArticle({ language: 'en' });
    expect(summary(await jobsFor(article.id))).toEqual([
      'all:publish:pending',
      'en-only:publish:pending',
    ]);
  });

  it('a draft, a re-publish of a live story and an invisible edit queue nothing', async () => {
    const ch = spyChannel('ch');
    unregister = registerChannels([ch]);

    const draft = await articleService.create({
      title: 'Quiet',
      category: CATEGORIES[0],
      language: 'en',
      author: 'Eleanor Vance',
      body: 'Body.',
      status: 'draft',
      featured: 0,
      tags: [],
      seo: {},
    });
    await articleService.update(draft.id, { deck: 'Draft edits are not news' });
    expect(await jobsFor(draft.id)).toEqual([]);

    await articleService.publish(draft.id);
    await articleService.publish(draft.id);
    await articleService.update(draft.id, { featured: 1, tags: ['markets'] });
    expect(summary(await jobsFor(draft.id))).toEqual(['ch:publish:pending']);
  });

  it('a visible edit queues an update only for channels that can update', async () => {
    const editable = spyChannel('editable');
    const fixed = spyChannel('fixed', { canUpdate: false });
    unregister = registerChannels([editable, fixed]);

    const article = await publishArticle();
    await articleService.update(article.id, { title: 'Markets Rally, Corrected' });
    expect(summary(await jobsFor(article.id))).toEqual([
      'editable:publish:pending',
      'fixed:publish:pending',
      'editable:update:pending',
    ]);
  });

  it('moving a live story to another edition retracts it there and publishes it here', async () => {
    const en = spyChannel('en', { languages: ['en'], ref: { post: 'en' } });
    const es = spyChannel('es', { languages: ['es'], ref: { post: 'es' } });
    unregister = registerChannels([en, es]);

    const article = await publishArticle({ language: 'en' });
    await drain([en, es]);
    await articleService.update(article.id, { language: 'es' });
    await drain([en, es]);

    expect(en.published.map((a) => a.language)).toEqual(['en']);
    expect(en.retracted).toEqual([{ post: 'en' }]);
    expect(es.published.map((a) => a.language)).toEqual(['es']);
    expect((await channelPostsFor(article.id)).map((p) => p.channel)).toEqual(['es']);
  });

  it('after unregistering, changes are no longer queued', async () => {
    unregister = registerChannels([spyChannel('ch')]);
    unregister();
    const article = await publishArticle();
    expect(await jobsFor(article.id)).toEqual([]);
  });
});

describe('outbox worker', () => {
  it('publishes, records the post, and completes the job', async () => {
    const ch = spyChannel('ch', { ref: { messageId: 42 } });
    unregister = registerChannels([ch]);

    const article = await publishArticle({ title: 'Delivered' });
    await drain([ch]);

    expect(ch.published.map((a) => a.title)).toEqual(['Delivered']);
    const [job] = await jobsFor(article.id);
    expect<(number | undefined)[]>(ch.deliveryIds).toEqual([job?.id]);
    expect(summary(await jobsFor(article.id))).toEqual(['ch:publish:done']);
    expect((await channelPostsFor(article.id)).map((p) => p.ref)).toEqual([{ messageId: 42 }]);
  });

  it('updates a delivered post with the article as it is now', async () => {
    const ch = spyChannel('ch', { ref: { messageId: 42 } });
    unregister = registerChannels([ch]);

    const article = await publishArticle();
    await drain([ch]);
    await articleService.update(article.id, { deck: 'Correction: the index rose 2%, not 3%.' });
    await drain([ch]);

    expect(ch.updated).toEqual([
      {
        article: expect.objectContaining({ deck: 'Correction: the index rose 2%, not 3%.' }),
        ref: { messageId: 42 },
      },
    ]);
  });

  it('records the post an update replaced the original with', async () => {
    const ch = spyChannel('ch', { ref: { messageId: 1 } });
    ch.update = async () => ({ messageId: 2 });
    unregister = registerChannels([ch]);

    const article = await publishArticle();
    await drain([ch]);
    await articleService.update(article.id, { title: 'New headline' });
    await drain([ch]);

    expect((await channelPostsFor(article.id)).map((p) => p.ref)).toEqual([{ messageId: 2 }]);
  });

  it('unpublish retracts the post; a later re-publish is a fresh delivery', async () => {
    const ch = spyChannel('ch', { ref: { messageId: 42 } });
    unregister = registerChannels([ch]);

    const article = await publishArticle();
    await drain([ch]);
    await articleService.unpublish(article.id);
    await drain([ch]);
    expect(ch.retracted).toEqual([{ messageId: 42 }]);
    expect(await channelPostsFor(article.id)).toEqual([]);

    await articleService.publish(article.id);
    await drain([ch]);
    expect(ch.published).toHaveLength(2);
    expect(new Set(ch.deliveryIds).size).toBe(2);
    expect(await channelPostsFor(article.id)).toHaveLength(1);
  });

  it('delete retracts the post after the article row is gone', async () => {
    const ch = spyChannel('ch', { ref: { messageId: 7 } });
    unregister = registerChannels([ch]);

    const article = await publishArticle();
    await drain([ch]);
    await articleService.remove(article.id);
    await drain([ch]);

    expect(ch.retracted).toEqual([{ messageId: 7 }]);
    expect(await channelPostsFor(article.id)).toEqual([]);
  });

  it('a story unpublished before its delivery ran is never posted at all', async () => {
    const ch = spyChannel('ch', { ref: { messageId: 1 } });
    unregister = registerChannels([ch]);

    const article = await publishArticle();
    await articleService.unpublish(article.id);
    await drain([ch]);

    expect(ch.published).toEqual([]);
    expect(ch.retracted).toEqual([]);
    expect(summary(await jobsFor(article.id))).toEqual(['ch:publish:done', 'ch:retract:done']);
  });

  it('a publish job whose post is already recorded does not post again', async () => {
    const ch = spyChannel('ch', { ref: { messageId: 1 } });
    const article = await publishArticle();
    await recordChannelPost(article.id, 'ch', { messageId: 1 });
    await enqueueJobs(getDb(), [{ articleId: article.id, channel: 'ch', action: 'publish' }]);
    await drain([ch]);

    expect(ch.published).toEqual([]);
  });

  it('retries a failing channel with backoff, without holding up the others', async () => {
    const flaky = spyChannel('flaky', { failPublish: 1, ref: { messageId: 9 } });
    const ok = spyChannel('ok');
    unregister = registerChannels([flaky, ok]);

    const article = await publishArticle();
    const now = new Date();
    await drain([flaky, ok], now);
    expect(ok.published).toHaveLength(1);
    const [failed] = (await jobsFor(article.id)).filter((job) => job.channel === 'flaky');
    expect(failed).toMatchObject({ status: 'pending', attempts: 1, lastError: 'flaky boom' });
    expect(failed?.nextAttemptAt.getTime()).toBe(now.getTime() + backoffMs(1));

    // Not due yet; then due.
    await drain([flaky, ok], new Date(now.getTime() + backoffMs(1) - 1));
    expect(flaky.published).toHaveLength(1);
    await drain([flaky, ok], new Date(now.getTime() + backoffMs(1)));
    expect(flaky.published).toHaveLength(2);
    expect(summary(await jobsFor(article.id))).toEqual(['flaky:publish:done', 'ok:publish:done']);
  });

  it('a later job for the same channel waits for an earlier one still being retried', async () => {
    const flaky = spyChannel('flaky', { failPublish: 1, ref: { messageId: 9 } });
    unregister = registerChannels([flaky]);

    const article = await publishArticle();
    const now = new Date();
    await drain([flaky], now);
    await articleService.unpublish(article.id);
    await drain([flaky], new Date(now.getTime() + 1));
    // The retraction did not overtake the publish it undoes.
    expect(flaky.retracted).toEqual([]);
    expect(summary(await jobsFor(article.id))).toEqual([
      'flaky:publish:pending',
      'flaky:retract:pending',
    ]);

    await drain([flaky], new Date(now.getTime() + backoffMs(1)));
    expect(summary(await jobsFor(article.id))).toEqual([
      'flaky:publish:done',
      'flaky:retract:done',
    ]);
    // The story was already a draft again: nothing was posted, nothing retracted.
    expect(flaky.published).toHaveLength(1);
    expect(flaky.retracted).toEqual([]);
  });

  it(`gives up after ${MAX_ATTEMPTS} attempts`, async () => {
    const broken = spyChannel('broken', { failPublish: MAX_ATTEMPTS });
    unregister = registerChannels([broken]);

    const article = await publishArticle();
    let now = new Date();
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      await drain([broken], now);
      now = new Date(now.getTime() + backoffMs(attempt));
    }
    expect(broken.published).toHaveLength(MAX_ATTEMPTS);
    const [job] = await jobsFor(article.id);
    expect(job).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS });
    await drain([broken], new Date(now.getTime() + backoffMs(MAX_ATTEMPTS)));
    expect(broken.published).toHaveLength(MAX_ATTEMPTS);
  });

  it('fails a job for a channel this process does not have', async () => {
    unregister = registerChannels([spyChannel('gone')]);
    const article = await publishArticle();
    await drain([]);
    expect(summary(await jobsFor(article.id))).toEqual(['gone:publish:failed']);
  });

  it('a leased job is not handed out again until its lease expires', async () => {
    unregister = registerChannels([spyChannel('ch')]);
    await publishArticle();
    const now = new Date();
    const leaseMs = 60_000;

    expect(await claimDueJobs(now, 10, leaseMs)).toHaveLength(1);
    expect(await claimDueJobs(now, 10, leaseMs)).toHaveLength(0);
    const [again] = await claimDueJobs(new Date(now.getTime() + leaseMs), 10, leaseMs);
    expect(again?.attempts).toBe(2);
  });

  it('startOutboxWorker works the queue on its interval and stops', async () => {
    const ch = spyChannel('ch');
    unregister = registerChannels([ch]);
    await publishArticle();

    const stop = startOutboxWorker([ch], 10);
    await waitFor(() => expect(ch.published).toHaveLength(1));
    stop();
  });
});

describe('mastodon channel', () => {
  it('federates through the AP module and records the delivered Note', async () => {
    const note = { noteId: 'https://gwj.test/users/news/articles/a1/notes/5', author: 'news' };
    const deliverArticle = vi.fn<ActivityPubModule['deliverArticle']>().mockResolvedValue(note);
    const updateArticle = vi.fn<ActivityPubModule['updateArticle']>().mockResolvedValue();
    const deleteArticle = vi.fn<ActivityPubModule['deleteArticle']>().mockResolvedValue();
    const channel = mastodonChannel({
      deliverArticle,
      updateArticle,
      deleteArticle,
    } as unknown as ActivityPubModule);

    expect(channel.platform).toBe('mastodon');
    expect(channel.isEnabled()).toBe(true);
    expect(['en', 'es', 'fr'].every((lang) => channel.servesLanguage(lang as Language))).toBe(true);

    const article = makeArticle({ language: 'es' });
    const ref = await channel.publish(article, { deliveryId: 5 });
    expect(deliverArticle).toHaveBeenCalledWith(article, 5);
    expect(ref).toEqual(note);

    await channel.update?.(article, { ...note });
    expect(updateArticle).toHaveBeenCalledWith(article, note);
    await channel.retract?.({ ...note });
    expect(deleteArticle).toHaveBeenCalledWith(note);

    await channel.retract?.({ messageId: 1 });
    expect(deleteArticle).toHaveBeenCalledTimes(1);
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

    await tg.publish(makeArticle(), DELIVERY);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('with a token + hero image: sends sendPhoto with the right chat_id, HTML caption and en URL', async () => {
    const env = makeEnv({ TELEGRAM_BOT_TOKEN: 'BOT123', TELEGRAM_CHANNEL: '@GWJOfficial' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(sentReply());
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
      DELIVERY,
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
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(sentReply());
    const tg = telegramChannels(env)[0];
    if (!tg) throw new Error('telegram channel missing');

    await tg.publish(makeArticle({ language: 'en', heroImage: undefined }), DELIVERY);

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

    await tg.publish(makeArticle({ language: 'es', slug: 'hola-mundo' }), DELIVERY);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('publish records { chatId, messageId, kind } from a real sendPhoto reply, to edit or retract it later', async () => {
    const env = makeEnv({ TELEGRAM_BOT_TOKEN: 'BOT123', TELEGRAM_CHANNEL: '@GWJOfficial' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, result: { message_id: 555, chat: { id: -1001234 } } }),
        { status: 200 },
      ),
    );
    const tg = telegramChannels(env)[0];
    if (!tg) throw new Error('telegram channel missing');

    const ref = await tg.publish(
      makeArticle({
        language: 'en',
        heroImage: { url: 'https://cdn.example.test/hero.jpg', alt: '' },
      }),
      DELIVERY,
    );
    expect(ref).toEqual({ chatId: -1001234, messageId: 555, kind: 'photo' });
  });

  it('publish rejects (so the job is retried) on a reply without a message or a non-OK reply', async () => {
    const env = makeEnv({ TELEGRAM_BOT_TOKEN: 'BOT123' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const tg = telegramChannels(env)[0];
    if (!tg) throw new Error('telegram channel missing');
    const article = makeArticle({ language: 'en', heroImage: undefined });

    fetchSpy.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    await expect(tg.publish(article, DELIVERY)).rejects.toThrow(/no message in the reply/);
    fetchSpy.mockResolvedValueOnce(
      new Response(
        '{"ok":false,"error_code":429,"description":"Too Many Requests: retry after 5"}',
        {
          status: 429,
        },
      ),
    );
    await expect(tg.publish(article, DELIVERY)).rejects.toThrow(/HTTP 429 Too Many Requests/);
    fetchSpy.mockRejectedValueOnce(new Error('network down'));
    await expect(tg.publish(article, DELIVERY)).rejects.toThrow(/network down/);
  });

  it('update edits the post in place: text, or photo and caption', async () => {
    const env = makeEnv({ TELEGRAM_BOT_TOKEN: 'BOT123' });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        fetchAnswering(() => new Response('{"ok":true,"result":{}}', { status: 200 })),
      );
    const tg = telegramChannels(env)[0];
    if (!tg?.update) throw new Error('telegram channel missing update');
    const hero = { url: 'https://cdn.example.test/new.jpg', alt: '' };

    const asText = await tg.update(makeArticle({ title: 'Fixed' }), {
      chatId: -1,
      messageId: 1,
      kind: 'text',
    });
    const asPhoto = await tg.update(makeArticle({ title: 'Fixed', heroImage: hero }), {
      chatId: -1,
      messageId: 2,
      kind: 'photo',
    });

    expect(asText).toBeUndefined();
    expect(asPhoto).toBeUndefined();
    expect(sentCalls(fetchSpy).map((call) => call.method)).toEqual([
      'editMessageText',
      'editMessageMedia',
    ]);
    const [text, media] = sentCalls(fetchSpy);
    expect(text?.body).toMatchObject({ chat_id: -1, message_id: 1, parse_mode: 'HTML' });
    expect(text?.body.text).toContain('<b>Fixed</b>');
    expect(media?.body.media).toMatchObject({ type: 'photo', media: hero.url, parse_mode: 'HTML' });
  });

  it('update replaces a photo post with a text post once the image is gone', async () => {
    const env = makeEnv({ TELEGRAM_BOT_TOKEN: 'BOT123' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(fetchAnswering(sentReply));
    const tg = telegramChannels(env)[0];
    if (!tg?.update) throw new Error('telegram channel missing update');

    // A post that may carry a photo: recorded as one, or of unknown kind (legacy).
    const fromPhoto = await tg.update(makeArticle(), { chatId: -1, messageId: 2, kind: 'photo' });
    const fromLegacy = await tg.update(makeArticle(), { chatId: -1, messageId: 3 });

    expect(sentCalls(fetchSpy).map((call) => [call.method, call.body.message_id])).toEqual([
      ['deleteMessage', 2],
      ['sendMessage', undefined],
      ['deleteMessage', 3],
      ['sendMessage', undefined],
    ]);
    expect(fromPhoto).toEqual({ chatId: -1, messageId: 1, kind: 'text' });
    expect(fromLegacy).toEqual({ chatId: -1, messageId: 1, kind: 'text' });
  });

  it('update leaves a legacy post (no recorded kind) that keeps its image as posted', async () => {
    const env = makeEnv({ TELEGRAM_BOT_TOKEN: 'BOT123' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const tg = telegramChannels(env)[0];
    if (!tg?.update) throw new Error('telegram channel missing update');

    await tg.update(
      makeArticle({ heroImage: { url: 'https://cdn.example.test/hero.jpg', alt: '' } }),
      { chatId: -1, messageId: 1 },
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('treats a post already gone or already up to date as done', async () => {
    const env = makeEnv({ TELEGRAM_BOT_TOKEN: 'BOT123' });
    const refusal = (description: string) =>
      new Response(JSON.stringify({ ok: false, error_code: 400, description }), { status: 400 });
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(refusal('Bad Request: message to delete not found'))
      .mockResolvedValueOnce(
        refusal(
          'Bad Request: message is not modified: specified new message content is exactly the same',
        ),
      )
      .mockResolvedValueOnce(refusal('Bad Request: not enough rights to delete a message'));
    const tg = telegramChannels(env)[0];
    if (!tg?.retract || !tg.update) throw new Error('telegram channel incomplete');
    const ref = { chatId: -1, messageId: 1, kind: 'text' };

    await expect(tg.retract(ref)).resolves.toBeUndefined();
    await expect(tg.update(makeArticle(), ref)).resolves.toBeUndefined();
    await expect(tg.retract(ref)).rejects.toThrow(/not enough rights/);
  });

  it('retract calls deleteMessage with the exact chat_id and message_id from the ref', async () => {
    const env = makeEnv({ TELEGRAM_BOT_TOKEN: 'BOT123' });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"ok":true,"result":true}', { status: 200 }));
    const tg = telegramChannels(env)[0];
    if (!tg?.retract) throw new Error('telegram channel missing retract');

    await tg.retract({ chatId: -1001234, messageId: 555 });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const call = fetchSpy.mock.calls[0];
    if (!call) throw new Error('fetch not called');
    const [url, init] = call;
    expect(String(url)).toBe('https://api.telegram.org/botBOT123/deleteMessage');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.chat_id).toBe(-1001234);
    expect(body.message_id).toBe(555);
  });

  it('retract is a no-op for a ref it does not recognize, and never fetches', async () => {
    const env = makeEnv({ TELEGRAM_BOT_TOKEN: 'BOT123' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const tg = telegramChannels(env)[0];
    if (!tg?.retract) throw new Error('telegram channel missing retract');

    await tg.retract({ someOtherChannelsRef: 'whatever' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('telegram channel — language routing through the outbox', () => {
  it('an en article sends only to the English channel; an es article only to the Spanish one', async () => {
    const env = makeEnv({
      TELEGRAM_BOT_TOKEN: 'BOT123',
      TELEGRAM_CHANNEL: '@GWJOfficial',
      TELEGRAM_CHANNEL_ES: '@gwj_ES',
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(fetchAnswering(sentReply));
    // Only the Telegram channels (no Mastodon) so fetch calls map 1:1 to Telegram posts.
    const channels = telegramChannels(env);
    unregister = registerChannels(channels);

    await publishArticle({ title: 'English Story', language: 'en' });
    await publishArticle({ title: 'Spanish Story', language: 'es' });
    await drain(channels);

    // One send per edition, each to its own channel — never the other's.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const bodies = fetchSpy.mock.calls.map(([, init]) =>
      JSON.parse(String((init as RequestInit | undefined)?.body)),
    );
    const english = bodies.find((b) => (b.caption ?? b.text)?.includes('English Story'));
    const spanish = bodies.find((b) => (b.caption ?? b.text)?.includes('Spanish Story'));
    expect(english?.chat_id).toBe('@GWJOfficial');
    expect(english?.caption ?? english?.text).toContain(
      'Read: https://globalworldjournal.com/article/english-story',
    );
    expect(spanish?.chat_id).toBe('@gwj_ES');
    expect(spanish?.caption ?? spanish?.text).toContain(
      'Read: https://globalworldjournal.com/es/article/spanish-story',
    );
  });
});
