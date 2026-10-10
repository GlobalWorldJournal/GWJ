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
    expect(html).toContain('<div id="root"><article>');
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

  it('sitemap: lists each edition root + categories and articles under their own language', async () => {
    const env = makeEnv();
    const articles = apiPage([
      apiArticle({ slug: 'hola', title: 'Hola', language: 'es' }),
      apiArticle({
        id: 'b'.repeat(24),
        slug: 'hello',
        title: 'Hello',
        author: 'Joe',
        category: 'Tech',
      }),
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(articles), { status: 200 })),
    );

    const xml = await (await get('/sitemap.xml', env)).text();
    expect(xml).toContain(`<loc>${SITE}/</loc>`);
    expect(xml).toContain(`<loc>${SITE}/es</loc>`);
    expect(xml).toContain(`<loc>${SITE}/fr</loc>`);
    expect(xml).toContain(`<loc>${SITE}/es/world</loc>`);
    // Articles live under their own language prefix.
    expect(xml).toContain(`<loc>${SITE}/es/article/hola</loc>`);
    expect(xml).toContain(`<loc>${SITE}/article/hello</loc>`);
    // Google-News tag carries the article language.
    expect(xml).toContain('<news:language>es</news:language>');
  });
});
