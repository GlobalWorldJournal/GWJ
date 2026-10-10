// Cloudflare Pages Advanced-Mode worker, bundled to dist/_worker.js at build time.
// For crawler-facing routes it fetches the backend API and injects per-page
// <title>, meta description, Open Graph, Twitter card and JSON-LD into the SPA
// shell. It also generates /sitemap.xml and /feed.xml. Everything else falls
// through to the static assets (which honor _redirects → SPA fallback).
//
// Editions are PATH-BASED: English is the canonical root (no prefix), Spanish
// lives under /es, French under /fr. The edition is read from the leading path
// segment, which is stripped before route matching. Article URLs are bound to
// the article's own language (a single-language document), so an article under
// the wrong prefix 301-redirects to its canonical URL.
import {
  authorSlug,
  CATEGORIES,
  categorySlug,
  DEFAULT_LANGUAGE,
  isLanguage,
  LANGUAGE_LOCALES,
  localePrefix,
  MENTION_PROFILE_URL,
  PaginatedPublicArticlesSchema,
  PublicArticleSchema,
  SUPPORTED_LANGUAGES,
  TELEGRAM_CHANNEL_URL,
  type Language,
  type PublicArticle,
} from '@gwj/shared-types';
import { escapeHtml, firstParagraphText, markdownToHtml } from './markdown';

const SITE_NAME = 'The Global World Journal';
const DEFAULT_SITE_URL = 'https://globalworldjournal.com';
const TWITTER_HANDLE = '@globalworldjrnl';
/** Google News recommends headlines of at most 110 characters. */
const NEWS_HEADLINE_MAX = 110;
/** A meta description built from the body is cut to this many characters. */
const DESCRIPTION_MAX = 200;
/** How many recent articles the sitemap and the feed list. */
const RECENT_ARTICLES = 50;

const CATEGORY_SLUGS: readonly string[] = CATEGORIES.map(categorySlug);
const PREFIXED_LANGUAGES: readonly Language[] = SUPPORTED_LANGUAGES.filter(
  (language) => language !== DEFAULT_LANGUAGE,
);

/** Cloudflare Pages bindings: runtime variables plus the static-asset server. */
export interface Env {
  API_BASE_URL?: string;
  SITE_URL?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}

interface Config {
  apiBaseUrl: string;
  siteUrl: string;
}

type JsonLd = Record<string, unknown>;

/**
 * Split a pathname into its edition and the edition-relative remainder.
 * `/es/article/x` → { lang: 'es', rest: '/article/x' }; `/world` → { lang: 'en',
 * rest: '/world' }; `/es` → { lang: 'es', rest: '/' }.
 */
function splitLang(pathname: string): { lang: Language; rest: string } {
  const first = pathname.split('/')[1] ?? '';
  const prefixed = PREFIXED_LANGUAGES.find((language) => language === first);
  if (prefixed) {
    return { lang: prefixed, rest: pathname.slice(`/${first}`.length) || '/' };
  }
  return { lang: DEFAULT_LANGUAGE, rest: pathname };
}

/** Build a site-absolute URL for an edition-relative path under a given edition. */
function editionUrl(siteUrl: string, lang: Language, relPath: string): string {
  const prefix = localePrefix(lang);
  if (relPath === '/') {
    return `${siteUrl}${prefix || '/'}`;
  }
  return `${siteUrl}${prefix}${relPath}`;
}

/**
 * hreflang alternates for an INDEX page (home, category, author, search). These
 * pages are genuine per-edition translations of the same surface, so we declare
 * every edition's URL plus x-default (the English/bare URL). `relPath` is the
 * edition-relative path (e.g. '/', '/world', '/author/jane', '/search').
 */
function indexHreflangLinks(siteUrl: string, relPath: string): string {
  const links = SUPPORTED_LANGUAGES.map(
    (lang) =>
      `<link rel="alternate" hreflang="${lang}" href="${escapeHtml(editionUrl(siteUrl, lang, relPath))}" />`,
  );
  links.push(
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(editionUrl(siteUrl, DEFAULT_LANGUAGE, relPath))}" />`,
  );
  return links.join('\n    ');
}

/**
 * hreflang alternates for an ARTICLE page. An article is a SINGLE language, so
 * we declare only its own language (self) plus x-default — both pointing at the
 * article's own canonical (language-prefixed) URL.
 */
function articleHreflangLinks(canonicalUrl: string, lang: Language): string {
  return [
    `<link rel="alternate" hreflang="${lang}" href="${escapeHtml(canonicalUrl)}" />`,
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(canonicalUrl)}" />`,
  ].join('\n    ');
}

function getConfig(env: Env): Config {
  const apiBaseUrl = (env.API_BASE_URL ?? '').replace(/\/$/, '');
  const siteUrl = (env.SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, '');
  return { apiBaseUrl, siteUrl };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** GET a JSON document; null on any network/HTTP failure (the page still renders). */
async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  try {
    const response = await fetch(url, { signal, headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    // An unreachable API degrades to the generic shell, never to an error page.
    return null;
  }
}

async function fetchArticle(config: Config, slug: string, signal: AbortSignal) {
  if (!config.apiBaseUrl) return null;
  const payload = await fetchJson(
    `${config.apiBaseUrl}/api/articles/${encodeURIComponent(slug)}`,
    signal,
  );
  const parsed = PublicArticleSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

async function fetchRecentArticles(config: Config, signal: AbortSignal): Promise<PublicArticle[]> {
  if (!config.apiBaseUrl) return [];
  const payload = await fetchJson(
    `${config.apiBaseUrl}/api/articles?limit=${RECENT_ARTICLES}&page=1`,
    signal,
  );
  const parsed = PaginatedPublicArticlesSchema.safeParse(payload);
  return parsed.success ? parsed.data.data : [];
}

function articleDescription(article: PublicArticle): string {
  if (article.seo.metaDescription) return article.seo.metaDescription;
  if (article.deck) return article.deck;
  const lead = firstParagraphText(article.body);
  if (lead) return lead.slice(0, DESCRIPTION_MAX);
  return `${SITE_NAME} — ${article.title}`;
}

function articleImage(article: PublicArticle): string {
  return article.seo.ogImage || article.heroImage?.url || '';
}

interface MetaTagOptions {
  title: string;
  description: string;
  url: string;
  image: string;
  type: 'website' | 'article';
  jsonLd: JsonLd | JsonLd[];
  extraMeta?: { property: string; content: string }[];
  lang: Language;
  hreflang: string;
  preloadImage?: string;
}

function buildMetaTags(options: MetaTagOptions): string {
  const { title, description, url, image, type, jsonLd, lang, hreflang } = options;
  const tags = [`<title>${escapeHtml(title)}</title>`];
  if (options.preloadImage) {
    tags.push(
      `<link rel="preload" as="image" fetchpriority="high" href="${escapeHtml(options.preloadImage)}" />`,
    );
  }
  tags.push(
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    hreflang,
    `<meta property="og:type" content="${escapeHtml(type)}" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:locale" content="${LANGUAGE_LOCALES[lang]}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:site" content="${TWITTER_HANDLE}" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
  );
  if (image) {
    tags.push(`<meta property="og:image" content="${escapeHtml(image)}" />`);
    tags.push(`<meta name="twitter:image" content="${escapeHtml(image)}" />`);
  }
  for (const meta of options.extraMeta ?? []) {
    tags.push(
      `<meta property="${escapeHtml(meta.property)}" content="${escapeHtml(meta.content)}" />`,
    );
  }
  for (const block of Array.isArray(jsonLd) ? jsonLd : [jsonLd]) {
    tags.push(
      `<script type="application/ld+json">${JSON.stringify(block).replace(/</g, '\\u003c')}</script>`,
    );
  }
  return tags.filter(Boolean).join('\n    ');
}

function organizationJsonLd(siteUrl: string): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsMediaOrganization',
    name: SITE_NAME,
    url: `${siteUrl}/`,
    logo: { '@type': 'ImageObject', url: `${siteUrl}/favicon.svg` },
    sameAs: [TELEGRAM_CHANNEL_URL, MENTION_PROFILE_URL],
  };
}

// Replace the shell's <title> and inject our SEO tags before </head>.
function injectHead(html: string, metaTags: string, lang: Language): string {
  // Reflect the edition on the root element so crawlers without JS see the
  // correct language.
  let output = html.replace(/<html lang="[^"]*"/i, `<html lang="${lang}"`);
  output = output.replace(/<title>[\s\S]*?<\/title>/i, '');
  // Drop the static default description so we don't emit two.
  output = output.replace(/<meta\s+name=["']description["'][^>]*>/i, '');
  if (output.includes('</head>')) {
    return output.replace('</head>', `    ${metaTags}\n  </head>`);
  }
  return output;
}

function websiteJsonLd(siteUrl: string): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: `${siteUrl}/`,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${siteUrl}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

function newsArticleJsonLd(
  article: PublicArticle,
  url: string,
  image: string,
  siteUrl: string,
): JsonLd {
  const lang = article.language;
  const jsonLd: JsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title.slice(0, NEWS_HEADLINE_MAX),
    description: articleDescription(article),
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    articleSection: article.category,
    inLanguage: lang,
    isAccessibleForFree: true,
    author: {
      '@type': 'Person',
      name: article.author,
      url: editionUrl(siteUrl, lang, `/author/${authorSlug(article.author)}`),
    },
    publisher: {
      '@type': 'NewsMediaOrganization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: `${siteUrl}/favicon.svg` },
    },
  };
  if (article.kicker) jsonLd.alternativeHeadline = article.deck || article.kicker;
  if (article.publishedAt) jsonLd.datePublished = article.publishedAt;
  jsonLd.dateModified = article.updatedAt;
  if (image) jsonLd.image = [image];
  return jsonLd;
}

/** Server-rendered article markup injected into #root so crawlers get the full text. */
function articleContentHtml(article: PublicArticle, image: string): string {
  const parts = ['<article>'];
  if (article.kicker) parts.push(`<p>${escapeHtml(article.kicker)}</p>`);
  parts.push(`<h1>${escapeHtml(article.title)}</h1>`);
  if (article.deck) parts.push(`<p>${escapeHtml(article.deck)}</p>`);
  parts.push(`<p>By ${escapeHtml(article.author)}</p>`);
  if (image) {
    const credit = article.heroImage?.credit ?? '';
    parts.push(
      `<figure><img src="${escapeHtml(image)}" alt="${escapeHtml(article.heroImage?.alt || article.title)}" />` +
        (credit ? `<figcaption>${escapeHtml(credit)}</figcaption>` : '') +
        '</figure>',
    );
  }
  parts.push(markdownToHtml(article.body));
  parts.push('</article>');
  return parts.join('\n');
}

/** Put server-rendered content inside #root. React replaces it on mount; crawlers read it. */
function injectRoot(html: string, contentHtml: string): string {
  return html.replace(/<div id="root">\s*<\/div>/i, `<div id="root">${contentHtml}</div>`);
}

async function getShell(env: Env, request: Request): Promise<Response> {
  // Fetch the SPA shell from the static-asset server. Request "/" (NOT
  // "/index.html") — Cloudflare Pages 308-redirects /index.html → / , and
  // env.ASSETS.fetch does not follow that redirect, which would yield an empty
  // body. "/" is served as index.html with 200. ASSETS never re-invokes this
  // worker, so there is no loop.
  const origin = new URL(request.url).origin;
  return env.ASSETS.fetch(new Request(`${origin}/`, request));
}

function withHtmlBody(shellResponse: Response, html: string): Response {
  const headers = new Headers(shellResponse.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  // Drop headers that no longer match the rewritten body.
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('location');
  return new Response(html, { status: 200, headers });
}

/** A 301 permanent redirect to an absolute URL (for legacy/wrong-locale URLs). */
function redirect(location: string): Response {
  return new Response(null, { status: 301, headers: { location } });
}

async function renderIndexPage(
  env: Env,
  request: Request,
  meta: Omit<MetaTagOptions, 'hreflang' | 'image' | 'type'>,
  config: Config,
  relPath: string,
): Promise<Response> {
  const shell = await getShell(env, request);
  const html = await shell.text();
  const metaTags = buildMetaTags({
    ...meta,
    image: '',
    type: 'website',
    hreflang: indexHreflangLinks(config.siteUrl, relPath),
  });
  return withHtmlBody(shell, injectHead(html, metaTags, meta.lang));
}

function handleHome(env: Env, request: Request, config: Config, lang: Language) {
  return renderIndexPage(
    env,
    request,
    {
      title: `${SITE_NAME} — World, Business, Markets, Tech, Politics, Opinion, Arts`,
      description: `${SITE_NAME}: breaking news and in-depth reporting across the world economy, markets, technology, politics, opinion and the arts.`,
      url: editionUrl(config.siteUrl, lang, '/'),
      jsonLd: [websiteJsonLd(config.siteUrl), organizationJsonLd(config.siteUrl)],
      lang,
    },
    config,
    '/',
  );
}

async function handleArticle(
  env: Env,
  request: Request,
  config: Config,
  slug: string,
  reqLang: Language,
): Promise<Response> {
  const shell = await getShell(env, request);
  const html = await shell.text();
  const article = await fetchArticle(config, slug, request.signal);

  if (!article) {
    // Article unknown to the edge — serve the shell so the SPA can 404 client-side.
    const url = editionUrl(config.siteUrl, reqLang, `/article/${slug}`);
    const metaTags = buildMetaTags({
      title: SITE_NAME,
      description: `${SITE_NAME} — independent global news.`,
      url,
      image: '',
      type: 'website',
      jsonLd: websiteJsonLd(config.siteUrl),
      lang: reqLang,
      hreflang: articleHreflangLinks(url, reqLang),
    });
    return withHtmlBody(shell, injectHead(html, metaTags, reqLang));
  }

  const lang = article.language;
  const canonical = editionUrl(config.siteUrl, lang, `/article/${article.slug}`);

  // An article is a single-language document. If it was requested under the
  // wrong edition prefix (or an old slug the API resolved), 301 to its canonical
  // URL so editions don't fork the same content across multiple indexable URLs.
  if (reqLang !== lang || article.slug !== slug) {
    return redirect(canonical);
  }

  const description = articleDescription(article);
  const image = articleImage(article);
  const extraMeta = [
    { property: 'article:section', content: article.category },
    { property: 'article:author', content: article.author },
  ];
  if (article.publishedAt) {
    extraMeta.push({ property: 'article:published_time', content: article.publishedAt });
  }
  extraMeta.push({ property: 'article:modified_time', content: article.updatedAt });
  const metaTags = buildMetaTags({
    title: article.seo.metaTitle || `${article.title} — ${SITE_NAME}`,
    description,
    url: canonical,
    image,
    type: 'article',
    jsonLd: newsArticleJsonLd(article, canonical, image, config.siteUrl),
    extraMeta,
    lang,
    hreflang: articleHreflangLinks(canonical, lang),
    preloadImage: image,
  });
  // Server-render the article text into #root so crawlers (and Google News) get
  // the full content without executing JS; React replaces it on mount.
  return withHtmlBody(
    shell,
    injectRoot(injectHead(html, metaTags, lang), articleContentHtml(article, image)),
  );
}

function handleCategory(env: Env, request: Request, config: Config, slug: string, lang: Language) {
  const name = slug.charAt(0).toUpperCase() + slug.slice(1);
  return renderIndexPage(
    env,
    request,
    {
      title: `${name} — ${SITE_NAME}`,
      description: `The latest ${name} news and analysis from ${SITE_NAME}.`,
      url: editionUrl(config.siteUrl, lang, `/${slug}`),
      jsonLd: websiteJsonLd(config.siteUrl),
      lang,
    },
    config,
    `/${slug}`,
  );
}

function handleAuthor(env: Env, request: Request, config: Config, slug: string, lang: Language) {
  return renderIndexPage(
    env,
    request,
    {
      title: `${SITE_NAME} — Author`,
      description: `Stories by this writer for ${SITE_NAME}.`,
      url: editionUrl(config.siteUrl, lang, `/author/${slug}`),
      jsonLd: websiteJsonLd(config.siteUrl),
      lang,
    },
    config,
    `/author/${slug}`,
  );
}

function handleSearch(env: Env, request: Request, config: Config, lang: Language) {
  return renderIndexPage(
    env,
    request,
    {
      title: `Search — ${SITE_NAME}`,
      description: `Search news and analysis across ${SITE_NAME}.`,
      url: editionUrl(config.siteUrl, lang, '/search'),
      jsonLd: websiteJsonLd(config.siteUrl),
      lang,
    },
    config,
    '/search',
  );
}

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  news?: string;
}

async function handleSitemap(request: Request, config: Config): Promise<Response> {
  const articles = await fetchRecentArticles(config, request.signal);

  // Index pages exist per edition: home + each category under '', '/es', '/fr'.
  const indexUrls: SitemapUrl[] = [];
  for (const lang of SUPPORTED_LANGUAGES) {
    indexUrls.push({ loc: editionUrl(config.siteUrl, lang, '/') });
    for (const slug of CATEGORY_SLUGS) {
      indexUrls.push({ loc: editionUrl(config.siteUrl, lang, `/${slug}`) });
    }
  }

  // Author pages: an author's body of work spans editions, so list each author
  // under every edition prefix.
  const authorSlugs = [...new Set(articles.map((a) => authorSlug(a.author)).filter(Boolean))];
  const authorUrls: SitemapUrl[] = [];
  for (const lang of SUPPORTED_LANGUAGES) {
    for (const slug of authorSlugs) {
      authorUrls.push({ loc: editionUrl(config.siteUrl, lang, `/author/${slug}`) });
    }
  }

  // Articles: each is a single-language document, listed once under its own
  // edition prefix. Google-News tags carry the article's own language.
  const articleUrls: SitemapUrl[] = articles.map((a) => ({
    loc: editionUrl(config.siteUrl, a.language, `/article/${a.slug}`),
    lastmod: a.updatedAt,
    news: a.publishedAt
      ? `<news:news><news:publication><news:name>${escapeXml(SITE_NAME)}</news:name>` +
        `<news:language>${escapeXml(a.language)}</news:language></news:publication>` +
        `<news:publication_date>${escapeXml(a.publishedAt)}</news:publication_date>` +
        `<news:title>${escapeXml(a.title)}</news:title></news:news>`
      : undefined,
  }));

  const urls = [...indexUrls, ...authorUrls, ...articleUrls]
    .map((u) => {
      const parts = [`<loc>${escapeXml(u.loc)}</loc>`];
      if (u.lastmod) parts.push(`<lastmod>${escapeXml(u.lastmod)}</lastmod>`);
      if (u.news) parts.push(u.news);
      return `  <url>${parts.join('')}</url>`;
    })
    .join('\n');
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ` +
    `xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${urls}\n</urlset>`;
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
}

async function handleFeed(request: Request, config: Config): Promise<Response> {
  // The RSS feed is the English edition (canonical). Each article links to its
  // own canonical (language-prefixed) URL.
  const articles = await fetchRecentArticles(config, request.signal);
  const items = articles
    .map((a) => {
      const link = editionUrl(config.siteUrl, a.language, `/article/${a.slug}`);
      const date = a.publishedAt ? new Date(a.publishedAt).toUTCString() : '';
      return (
        `    <item>\n` +
        `      <title>${escapeXml(a.title)}</title>\n` +
        `      <link>${escapeXml(link)}</link>\n` +
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>\n` +
        `      <dc:creator>${escapeXml(a.author)}</dc:creator>\n` +
        `      <category>${escapeXml(a.category)}</category>\n` +
        (date ? `      <pubDate>${escapeXml(date)}</pubDate>\n` : '') +
        `      <description>${escapeXml(articleDescription(a))}</description>\n` +
        `    </item>`
      );
    })
    .join('\n');
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">\n` +
    `  <channel>\n` +
    `    <title>${escapeXml(SITE_NAME)}</title>\n` +
    `    <link>${escapeXml(config.siteUrl)}/</link>\n` +
    `    <description>Breaking news and in-depth reporting from ${escapeXml(SITE_NAME)}.</description>\n` +
    `    <language>en</language>\n${items}\n  </channel>\n</rss>`;
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
  });
}

/**
 * Back-compat for legacy `?lang=` URLs (the old query-param editions). Returns a
 * redirect target (absolute URL) when a redirect is needed, else null:
 *   ?lang=es / ?lang=fr → 301 to the path-prefixed equivalent (other params kept)
 *   ?lang=en            → 301 stripping the param (English is the bare path)
 */
function legacyLangRedirect(url: URL, config: Config): string | null {
  const legacy = url.searchParams.get('lang');
  if (!legacy || !isLanguage(legacy)) return null;
  const { lang: pathLang, rest } = splitLang(url.pathname);
  // The path's own prefix wins if present; otherwise the legacy ?lang= picks the
  // edition. Either way the stale ?lang= param is dropped.
  const targetLang = pathLang === DEFAULT_LANGUAGE ? legacy : pathLang;
  const params = new URLSearchParams(url.searchParams);
  params.delete('lang');
  const query = params.toString();
  return `${editionUrl(config.siteUrl, targetLang, rest)}${query ? `?${query}` : ''}${url.hash}`;
}

/**
 * ActivityPub / fediverse paths live on the APEX domain (the handle is
 * @user@globalworldjournal.com, so WebFinger and the actor must answer here),
 * but the implementation runs on the API backend. These paths are reverse-
 * proxied VERBATIM to the backend: the path and body must arrive byte-for-byte
 * unchanged so the backend can verify the inbound HTTP Signature's
 * `(request-target)` and `Digest`.
 */
function isActivityPubPath(pathname: string): boolean {
  return (
    pathname === '/.well-known/webfinger' ||
    pathname === '/.well-known/nodeinfo' ||
    pathname === '/nodeinfo/2.1' ||
    pathname === '/inbox' ||
    pathname === '/users' ||
    pathname.startsWith('/users/')
  );
}

async function proxyActivityPub(request: Request, config: Config, url: URL): Promise<Response> {
  if (!config.apiBaseUrl) {
    return new Response('Federation backend not configured', { status: 404 });
  }
  const headers = new Headers(request.headers);
  // The remote server signed the `host` header as the public apex; the backend
  // verifies signatures against its configured FEDIVERSE_DOMAIN. Pass the
  // original host explicitly so the origin can reconstruct apex-absolute URLs.
  headers.set('X-Forwarded-Host', url.host);
  headers.set('X-Forwarded-Proto', 'https');
  const init: RequestInit = { method: request.method, headers, redirect: 'manual' };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    // Buffer the body so the proxied bytes exactly match what was signed/digested.
    init.body = await request.arrayBuffer();
  }
  return fetch(`${config.apiBaseUrl}${url.pathname}${url.search}`, init);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const config = getConfig(env);

    // Fediverse endpoints (incl. POST /inbox) — proxy before any GET/SPA logic.
    if (isActivityPubPath(pathname)) {
      return proxyActivityPub(request, config, url);
    }

    if (request.method !== 'GET') {
      return env.ASSETS.fetch(request);
    }

    // Legacy ?lang= URLs → 301 to the path-based equivalent (before routing).
    const legacyTarget = legacyLangRedirect(url, config);
    if (legacyTarget) {
      return redirect(legacyTarget);
    }

    if (pathname === '/sitemap.xml') {
      return handleSitemap(request, config);
    }

    if (pathname === '/feed.xml' || pathname === '/rss.xml') {
      return handleFeed(request, config);
    }

    // Resolve the edition from the leading path segment, then match the route on
    // the edition-relative remainder.
    const { lang, rest } = splitLang(pathname);

    if (rest === '/') {
      return handleHome(env, request, config, lang);
    }

    const articleSlug = /^\/article\/([^/]+)\/?$/.exec(rest)?.[1];
    if (articleSlug) {
      return handleArticle(env, request, config, decodeURIComponent(articleSlug), lang);
    }

    const author = /^\/author\/([^/]+)\/?$/.exec(rest)?.[1];
    if (author) {
      return handleAuthor(env, request, config, decodeURIComponent(author).toLowerCase(), lang);
    }

    if (rest === '/search' || rest === '/search/') {
      return handleSearch(env, request, config, lang);
    }

    const section = /^\/([^/]+)\/?$/.exec(rest)?.[1];
    if (section) {
      const slug = decodeURIComponent(section).toLowerCase();
      if (CATEGORY_SLUGS.includes(slug)) {
        return handleCategory(env, request, config, slug, lang);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
