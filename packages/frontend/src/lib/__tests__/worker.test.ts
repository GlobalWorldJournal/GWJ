// @vitest-environment node
// The worker is server-side code (no DOM). Run it under Node's global fetch/
// Request/Response so cross-realm AbortSignal checks behave like the real
// Cloudflare runtime (jsdom's Request rejects a foreign signal).
import { describe, it, expect, vi, afterEach } from 'vitest';
// The SEO worker (src/worker, bundled to dist/_worker.js); we import its module
// default and drive its fetch() to verify path-based locale parsing.
import worker from '../../worker';

const SHELL =
  '<!doctype html><html lang="en"><head><title>App</title></head><body><div id="root"></div></body></html>';
const SITE = 'https://globalworldjournal.com';
const API = 'https://api.example.test';

/** A fake env whose ASSETS always serves the SPA shell. */
function makeEnv() {
  return {
    SITE_URL: SITE,
    API_BASE_URL: API,
    ASSETS: { fetch: vi.fn().mockResolvedValue(new Response(SHELL, { status: 200 })) },
  };
}

function get(path: string, env = makeEnv()) {
  return worker.fetch(new Request(`${SITE}${path}`), env);
}

/** An article exactly as the public API returns it (the worker validates it). */
function apiArticle(overrides: Record<string, unknown>) {
  return {
    id: 'a'.repeat(24),
    title: 'A story',
    category: 'World',
    language: 'en',
    author: 'Ana',
    body: 'Texto.',
    status: 'published',
    featured: 0,
    tags: [],
    seo: {},
    publishedAt: '2026-06-23T00:00:00.000Z',
    createdAt: '2026-06-23T00:00:00.000Z',
    updatedAt: '2026-06-23T00:00:00.000Z',
    ...overrides,
  };
}

/** A page of articles as the public list endpoint returns it. */
function apiPage(data: unknown[]) {
  return { data, pagination: { page: 1, limit: 50, total: data.length, totalPages: 1 } };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('worker locale parsing', () => {
  it('home: English root emits all-edition hreflang and a bare canonical', async () => {
    const html = await (await get('/')).text();
    expect(html).toContain('<html lang="en"');
    expect(html).toContain(`<link rel="canonical" href="${SITE}/" />`);
    expect(html).toContain(`hreflang="en" href="${SITE}/"`);
    expect(html).toContain(`hreflang="es" href="${SITE}/es"`);
    expect(html).toContain(`hreflang="fr" href="${SITE}/fr"`);
    expect(html).toContain(`hreflang="x-default" href="${SITE}/"`);
    expect(html).toContain('content="en_US"');
  });

  it('home: /es is the Spanish edition (lang, canonical, og:locale)', async () => {
    const html = await (await get('/es')).text();
    expect(html).toContain('<html lang="es"');
    expect(html).toContain(`<link rel="canonical" href="${SITE}/es" />`);
    expect(html).toContain('content="es_ES"');
  });

  it('category: strips the /fr prefix before matching and localizes canonical', async () => {
    const html = await (await get('/fr/world')).text();
    expect(html).toContain('<html lang="fr"');
    expect(html).toContain(`<link rel="canonical" href="${SITE}/fr/world" />`);
    expect(html).toContain(`hreflang="es" href="${SITE}/es/world"`);
    expect(html).toContain(`hreflang="x-default" href="${SITE}/world"`);
  });

  it('article: canonical is bound to the article language and gets self+x-default hreflang only', async () => {
    const env = makeEnv();
    const article = apiArticle({ slug: 'hola-mundo', title: 'Hola Mundo', language: 'es' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(article), { status: 200 })),
    );

    const html = await (await get('/es/article/hola-mundo', env)).text();
    expect(html).toContain('<html lang="es"');
    expect(html).toContain(`<link rel="canonical" href="${SITE}/es/article/hola-mundo" />`);
    expect(html).toContain(`hreflang="es" href="${SITE}/es/article/hola-mundo"`);
    expect(html).toContain(`hreflang="x-default" href="${SITE}/es/article/hola-mundo"`);
    // No cross-language article alternates are fabricated.
    expect(html).not.toContain(`hreflang="fr"`);
    expect(html).not.toContain(`hreflang="en" href="${SITE}/article/hola-mundo"`);
    // The article text is server-rendered into #root for crawlers.
    expect(html).toContain('<div id="root"><article class="sr-only">');
    // The app receives the article with the page instead of fetching it again.
    expect(html).toContain('<script type="application/json" id="gwj-article">');
    expect(html).toContain('"slug":"hola-mundo"');
  });

  it('article: wrong locale prefix 301-redirects to the canonical URL', async () => {
    const env = makeEnv();
    const article = apiArticle({ slug: 'hola-mundo', title: 'Hola Mundo', language: 'es' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(article), { status: 200 })),
    );

    // Spanish article requested under the English (bare) path.
    const res = await get('/article/hola-mundo', env);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(`${SITE}/es/article/hola-mundo`);
  });

  it('legacy ?lang=es 301-redirects to the path-prefixed equivalent (params kept)', async () => {
    const res = await get('/world?lang=es&x=1');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(`${SITE}/es/world?x=1`);
  });

  it('legacy ?lang=en 301-redirects to the bare path (param stripped)', async () => {
    const res = await get('/world?lang=en');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(`${SITE}/world`);
  });

  it('sitemap.xml is an index of the pages, news and one article sitemap per API page', async () => {
    const env = makeEnv();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [],
          pagination: { page: 1, limit: 50, total: 120, totalPages: 3 },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const xml = await (await get('/sitemap.xml', env)).text();
    expect(xml).toContain('<sitemapindex');
    expect(xml).toContain(`<loc>${SITE}/sitemap-pages.xml</loc>`);
    expect(xml).toContain(`<loc>${SITE}/sitemap-news.xml</loc>`);
    expect(xml).toContain(`<loc>${SITE}/sitemap-articles-3.xml</loc>`);
    expect(xml).not.toContain('sitemap-articles-4.xml');
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('sort=latest');
  });

  it('an article sitemap lists that page of articles under their own edition', async () => {
    const env = makeEnv();
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify(
            apiPage([
              apiArticle({ slug: 'hola', title: 'Hola', language: 'es' }),
              apiArticle({ id: 'b'.repeat(24), slug: 'hello', title: 'Hello' }),
            ]),
          ),
        ),
      );
    vi.stubGlobal('fetch', fetchSpy);

    const xml = await (await get('/sitemap-articles-2.xml', env)).text();
    expect(xml).toContain(`<loc>${SITE}/es/article/hola</loc>`);
    expect(xml).toContain(`<loc>${SITE}/article/hello</loc>`);
    expect(xml).not.toContain('<news:');
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('page=2');
  });

  it('the pages sitemap lists every edition home, section and roster writer', async () => {
    const xml = await (await get('/sitemap-pages.xml')).text();
    expect(xml).toContain(`<loc>${SITE}/es/world</loc>`);
    expect(xml).toContain(`<loc>${SITE}/fr/author/eleanor-vance</loc>`);
  });

  it('the news sitemap holds only the last 48 hours, with each story\u2019s language', async () => {
    const env = makeEnv();
    const now = Date.now();
    const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000).toISOString();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify(
            apiPage([
              apiArticle({ slug: 'fresh', title: 'Fresh', language: 'es', publishedAt: iso(2) }),
              apiArticle({
                id: 'b'.repeat(24),
                slug: 'stale',
                title: 'Stale',
                publishedAt: iso(72),
              }),
            ]),
          ),
        ),
      ),
    );

    const xml = await (await get('/sitemap-news.xml', env)).text();
    expect(xml).toContain(`<loc>${SITE}/es/article/fresh</loc>`);
    expect(xml).toContain('<news:language>es</news:language>');
    expect(xml).not.toContain('stale');
  });

  it('feeds are per edition: language, self link, newest first from that edition only', async () => {
    const env = makeEnv();
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify(apiPage([apiArticle({ slug: 'hola', title: 'Hola', language: 'es' })])),
        ),
      );
    vi.stubGlobal('fetch', fetchSpy);

    const xml = await (await get('/es/feed.xml', env)).text();
    expect(xml).toContain('<language>es</language>');
    expect(xml).toContain(`<atom:link href="${SITE}/es/feed.xml" rel="self"`);
    expect(xml).toContain(`<link>${SITE}/es/article/hola</link>`);
    const requested = String(fetchSpy.mock.calls[0]?.[0]);
    expect(requested).toContain('language=es');
    expect(requested).toContain('sort=latest');

    const english = await (await get('/rss.xml', env)).text();
    expect(english).toContain('<language>en</language>');
  });

  it('an unknown article is a real 404 (noindex), not a soft 404', async () => {
    const env = makeEnv();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })));
    const res = await get('/article/no-such-story', env);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('<meta name="robots" content="noindex" />');
  });

  it('an article declares its published editions as hreflang alternates (x-default: English)', async () => {
    const env = makeEnv();
    const article = apiArticle({
      slug: 'hola-mundo',
      title: 'Hola Mundo',
      language: 'es',
      translations: [
        { id: 'b'.repeat(24), language: 'en', slug: 'hello-world', status: 'published' },
        { id: 'c'.repeat(24), language: 'fr', slug: 'bonjour', status: 'draft' },
      ],
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(article))));

    const html = await (await get('/es/article/hola-mundo', env)).text();
    expect(html).toContain(`hreflang="es" href="${SITE}/es/article/hola-mundo"`);
    expect(html).toContain(`hreflang="en" href="${SITE}/article/hello-world"`);
    expect(html).toContain(`hreflang="x-default" href="${SITE}/article/hello-world"`);
    // A draft edition is not an alternate.
    expect(html).not.toContain('hreflang="fr"');
  });

  it('article JSON-LD carries a breadcrumb and the published corrections', async () => {
    const env = makeEnv();
    const article = apiArticle({
      slug: 'vote',
      title: 'Vote set for Wednesday',
      category: 'Politics',
      corrections: [
        { at: '2026-06-24T10:00:00.000Z', text: 'An earlier version misstated the day.' },
      ],
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(article))));

    const html = await (await get('/article/vote', env)).text();
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain(`"item":"${SITE}/politics"`);
    expect(html).toContain(
      '"correction":[{"@type":"CorrectionComment","text":"An earlier version misstated the day.","datePublished":"2026-06-24T10:00:00.000Z"}]',
    );
  });

  it('section and writer pages are titled in the edition language, writers by name', async () => {
    expect(await (await get('/es/world')).text()).toContain(
      '<title>Mundo — The Global World Journal</title>',
    );
    expect(await (await get('/author/eleanor-vance')).text()).toContain(
      '<title>Eleanor Vance, Senior Markets Correspondent — The Global World Journal</title>',
    );
  });

  it('pages allow large image previews; search results are never indexed', async () => {
    expect(await (await get('/')).text()).toContain(
      '<meta name="robots" content="max-image-preview:large" />',
    );
    expect(await (await get('/search')).text()).toContain(
      '<meta name="robots" content="noindex, follow" />',
    );
  });
});
