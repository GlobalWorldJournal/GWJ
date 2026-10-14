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
  findWriterBySlug,
  isLanguage,
  LANGUAGE_LOCALES,
  localePrefix,
  MENTION_PROFILE_URL,
  PaginatedPublicArticlesSchema,
  PublicArticleSchema,
  SUPPORTED_LANGUAGES,
  TELEGRAM_CHANNEL_URL,
  WRITERS,
  type Category,
  type Language,
  type PaginatedPublicArticles,
  type PublicArticle,
} from '@gwj/shared-types';
import { categoryLabel, translate } from '../lib/dictionary';
import { articleDataScript } from '../lib/serverData';
import { fetchJson } from './edgeCache';
import {
  articleDescription,
  articleMeta,
  authorMeta,
  categoryMeta,
  homeMeta,
  notFoundMeta,
  searchMeta,
  SITE_NAME,
  staticMeta,
  type PageMeta,
  tagMeta,
} from '../lib/pageMeta';
import { escapeHtml, markdownToHtml } from './markdown';
import { subscribeWithGoogleTags } from './subscribeWithGoogle';
import { IMAGE_SIZES, responsiveImage, type ResponsiveImageProps } from '../lib/responsiveImage';

const DEFAULT_SITE_URL = 'https://globalworldjournal.com';
const TWITTER_HANDLE = '@globalworldjrnl';
/** Google News recommends headlines of at most 110 characters. */
const NEWS_HEADLINE_MAX = 110;
/** The API's page size limit: one article sitemap file per API page. */
const API_PAGE_SIZE = 50;
/** Google News only wants articles published in the last two days... */
const NEWS_WINDOW_MS = 48 * 60 * 60 * 1000;
/** ...and at most 1,000 of them per news sitemap. */
const NEWS_MAX_PAGES = 1000 / API_PAGE_SIZE;
/** Every page may show large image previews in search and Discover. */
const DEFAULT_ROBOTS = 'max-image-preview:large';

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
 * hreflang alternates for an ARTICLE page: the article itself plus every
 * PUBLISHED edition of the same story (linked translations), each at its own
 * canonical URL. x-default is the English edition when the story has one,
 * otherwise the article itself. An untranslated story declares only itself.
 */
function articleHreflangLinks(siteUrl: string, article: PublicArticle): string {
  const editions = [
    { language: article.language, slug: article.slug },
    ...(article.translations ?? [])
      .filter((t) => t.status === 'published')
      .map((t) => ({ language: t.language, slug: t.slug })),
  ];
  const url = (e: { language: Language; slug: string }) =>
    editionUrl(siteUrl, e.language, `/article/${e.slug}`);
  const fallback = editions.find((e) => e.language === DEFAULT_LANGUAGE) ?? editions[0];
  const links = editions.map(
    (e) => `<link rel="alternate" hreflang="${e.language}" href="${escapeHtml(url(e))}" />`,
  );
  if (fallback) {
    links.push(`<link rel="alternate" hreflang="x-default" href="${escapeHtml(url(fallback))}" />`);
  }
  return links.join('\n    ');
}

/** hreflang for a URL with no article behind it (an unknown article): itself only. */
function selfHreflangLinks(url: string, lang: Language): string {
  return [
    `<link rel="alternate" hreflang="${lang}" href="${escapeHtml(url)}" />`,
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(url)}" />`,
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

async function fetchArticle(config: Config, slug: string, signal: AbortSignal) {
  if (!config.apiBaseUrl) return null;
  const payload = await fetchJson(
    `${config.apiBaseUrl}/api/articles/${encodeURIComponent(slug)}`,
    signal,
  );
  const parsed = PublicArticleSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

interface ArticlePageQuery {
  page: number;
  language?: Language;
}

/** One page of published articles, newest first; null if the API is unavailable. */
async function fetchLatestPage(
  config: Config,
  signal: AbortSignal,
  { page, language }: ArticlePageQuery,
): Promise<PaginatedPublicArticles | null> {
  if (!config.apiBaseUrl) return null;
  const params = new URLSearchParams({
    sort: 'latest',
    limit: String(API_PAGE_SIZE),
    page: String(page),
  });
  if (language) params.set('language', language);
  const payload = await fetchJson(`${config.apiBaseUrl}/api/articles?${params.toString()}`, signal);
  const parsed = PaginatedPublicArticlesSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
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
  /** The image the page paints first (the article hero), fetched with the HTML. */
  preloadImage?: ResponsiveImageProps;
  /** `<meta name="robots">`; every page allows large image previews by default. */
  robots?: string;
}

function buildMetaTags(options: MetaTagOptions): string {
  const { title, description, url, image, type, jsonLd, lang, hreflang } = options;
  const tags = [`<title>${escapeHtml(title)}</title>`];
  if (options.preloadImage) {
    // With the same srcset/sizes as the <img>, so the browser preloads the
    // rendition it will paint, not the full-size file as well.
    const { src, srcSet, sizes } = options.preloadImage;
    const responsive =
      srcSet && sizes
        ? ` imagesrcset="${escapeHtml(srcSet)}" imagesizes="${escapeHtml(sizes)}"`
        : '';
    tags.push(
      `<link rel="preload" as="image" fetchpriority="high" href="${escapeHtml(src)}"${responsive} />`,
    );
  }
  tags.push(
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta name="robots" content="${escapeHtml(options.robots ?? DEFAULT_ROBOTS)}" />`,
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
    articleSection: categoryLabel(article.category, lang),
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
  // Published corrections, as schema.org asks news publishers to mark them.
  const corrections = article.corrections ?? [];
  if (corrections.length > 0) {
    jsonLd.correction = corrections.map((c) => ({
      '@type': 'CorrectionComment',
      text: c.text,
      datePublished: c.at,
    }));
  }
  return jsonLd;
}

/** Home › Section › Story, in the article's own edition. */
function breadcrumbJsonLd(article: PublicArticle, url: string, siteUrl: string): JsonLd {
  const lang = article.language;
  const crumbs = [
    { name: SITE_NAME, item: editionUrl(siteUrl, lang, '/') },
    {
      name: categoryLabel(article.category, lang),
      item: editionUrl(siteUrl, lang, `/${categorySlug(article.category)}`),
    },
    { name: article.title, item: url },
  ];
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      ...crumb,
    })),
  };
}

/**
 * The full article text, server-rendered into #root for crawlers (Google News
 * reads it without running JavaScript). It is visually hidden: readers see the
 * app's styled page, which renders at once from the embedded article data, so
 * there is no unstyled flash and no layout jump when the app takes over.
 */
function articleContentHtml(article: PublicArticle, image: string): string {
  const parts = ['<article class="sr-only">'];
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

/**
 * Put server-rendered content inside #root (React replaces it on mount) and
 * the article data before </body> (the app reads it instead of refetching).
 */
function injectRoot(html: string, contentHtml: string, dataScript: string): string {
  return html
    .replace(/<div id="root">\s*<\/div>/i, `<div id="root">${contentHtml}</div>`)
    .replace('</body>', `${dataScript}\n</body>`);
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

function withHtmlBody(shellResponse: Response, html: string, status = 200): Response {
  const headers = new Headers(shellResponse.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  // Drop headers that no longer match the rewritten body.
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('location');
  return new Response(html, { status, headers });
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
      ...homeMeta(lang),
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
    // No such (published) article: a real 404 for crawlers — not a soft-404
    // page with a 200 — still carrying the shell so readers see the SPA's page.
    const url = editionUrl(config.siteUrl, reqLang, `/article/${slug}`);
    const metaTags = buildMetaTags({
      title: SITE_NAME,
      description: notFoundMeta(reqLang).description,
      url,
      image: '',
      type: 'website',
      jsonLd: websiteJsonLd(config.siteUrl),
      lang: reqLang,
      hreflang: selfHreflangLinks(url, reqLang),
      robots: 'noindex',
    });
    return withHtmlBody(shell, injectHead(html, metaTags, reqLang), 404);
  }

  const lang = article.language;
  const canonical = editionUrl(config.siteUrl, lang, `/article/${article.slug}`);

  // An article is a single-language document. If it was requested under the
  // wrong edition prefix (or an old slug the API resolved), 301 to its canonical
  // URL so editions don't fork the same content across multiple indexable URLs.
  if (reqLang !== lang || article.slug !== slug) {
    return redirect(canonical);
  }

  const image = articleImage(article);
  const extraMeta = [
    { property: 'article:section', content: categoryLabel(article.category, lang) },
    { property: 'article:author', content: article.author },
  ];
  if (article.publishedAt) {
    extraMeta.push({ property: 'article:published_time', content: article.publishedAt });
  }
  extraMeta.push({ property: 'article:modified_time', content: article.updatedAt });
  const metaTags = buildMetaTags({
    ...articleMeta(article),
    url: canonical,
    image,
    type: 'article',
    jsonLd: [
      newsArticleJsonLd(article, canonical, image, config.siteUrl),
      breadcrumbJsonLd(article, canonical, config.siteUrl),
    ],
    extraMeta,
    lang,
    hreflang: articleHreflangLinks(config.siteUrl, article),
    preloadImage: article.heroImage
      ? responsiveImage(article.heroImage, IMAGE_SIZES.articleHero, 1200, 800)
      : undefined,
  });
  // Server-render the article text into #root so crawlers (and Google News) get
  // the full content without executing JS; React replaces it on mount.
  return withHtmlBody(
    shell,
    injectRoot(
      injectHead(html, `${metaTags}\n    ${subscribeWithGoogleTags(lang)}`, lang),
      articleContentHtml(article, image),
      articleDataScript(article),
    ),
  );
}

function handleCategory(
  env: Env,
  request: Request,
  config: Config,
  category: Category,
  lang: Language,
) {
  const slug = categorySlug(category);
  return renderIndexPage(
    env,
    request,
    {
      ...categoryMeta(category, lang),
      url: editionUrl(config.siteUrl, lang, `/${slug}`),
      jsonLd: websiteJsonLd(config.siteUrl),
      lang,
    },
    config,
    `/${slug}`,
  );
}

function handleAuthor(env: Env, request: Request, config: Config, slug: string, lang: Language) {
  const writer = findWriterBySlug(slug);
  return renderIndexPage(
    env,
    request,
    {
      ...authorMeta(writer, lang),
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
      ...searchMeta(lang),
      url: editionUrl(config.siteUrl, lang, '/search'),
      jsonLd: websiteJsonLd(config.siteUrl),
      lang,
      // Result pages are endless query permutations: crawl through, never index.
      robots: 'noindex, follow',
    },
    config,
    '/search',
  );
}

/** A story tag's page: titled in the edition, indexable like any section. */
function handleTag(env: Env, request: Request, config: Config, tag: string, lang: Language) {
  const relPath = `/tag/${encodeURIComponent(tag)}`;
  return renderIndexPage(
    env,
    request,
    {
      ...tagMeta(tag, lang),
      url: editionUrl(config.siteUrl, lang, relPath),
      jsonLd: websiteJsonLd(config.siteUrl),
      lang,
    },
    config,
    relPath,
  );
}

/** A footer/static page (About, Careers, Terms…): its name, in the edition's language. */
/** Pages reached only from an emailed link (it carries a one-time token): never indexed. */
const UNINDEXED_STATIC_PATHS: ReadonlySet<string> = new Set([
  '/newsletter/confirm',
  '/newsletter/unsubscribe',
]);

function handleStaticPage(
  env: Env,
  request: Request,
  config: Config,
  path: string,
  meta: PageMeta,
  lang: Language,
) {
  return renderIndexPage(
    env,
    request,
    {
      ...meta,
      url: editionUrl(config.siteUrl, lang, path),
      jsonLd: websiteJsonLd(config.siteUrl),
      lang,
      ...(UNINDEXED_STATIC_PATHS.has(path) ? { robots: 'noindex' } : {}),
    },
    config,
    path,
  );
}

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  news?: string;
}

function xmlResponse(body: string, contentType: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': `${contentType}; charset=utf-8` },
  });
}

function urlset(urls: SitemapUrl[], withNews = false): Response {
  const entries = urls
    .map((u) => {
      const parts = [`<loc>${escapeXml(u.loc)}</loc>`];
      if (u.lastmod) parts.push(`<lastmod>${escapeXml(u.lastmod)}</lastmod>`);
      if (u.news) parts.push(u.news);
      return `  <url>${parts.join('')}</url>`;
    })
    .join('\n');
  const newsNs = withNews ? ' xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"' : '';
  return xmlResponse(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${newsNs}>\n${entries}\n</urlset>`,
    'application/xml',
  );
}

function articleUrl(config: Config, article: PublicArticle): string {
  return editionUrl(config.siteUrl, article.language, `/article/${article.slug}`);
}

/**
 * /sitemap.xml — the index: the static pages, the Google News sitemap, and one
 * sitemap per page of articles, so EVERY article is listed (not just the latest).
 */
async function handleSitemapIndex(request: Request, config: Config): Promise<Response> {
  const first = await fetchLatestPage(config, request.signal, { page: 1 });
  const pages = Math.max(1, first?.pagination.totalPages ?? 1);
  const locs = [
    `${config.siteUrl}/sitemap-pages.xml`,
    `${config.siteUrl}/sitemap-news.xml`,
    ...Array.from({ length: pages }, (_, i) => `${config.siteUrl}/sitemap-articles-${i + 1}.xml`),
  ];
  const entries = locs.map((loc) => `  <sitemap><loc>${escapeXml(loc)}</loc></sitemap>`).join('\n');
  return xmlResponse(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>`,
    'application/xml',
  );
}

/** Every edition's home, sections and writer pages. */
function handleSitemapPages(config: Config): Response {
  const urls: SitemapUrl[] = [];
  for (const lang of SUPPORTED_LANGUAGES) {
    urls.push({ loc: editionUrl(config.siteUrl, lang, '/') });
    for (const slug of CATEGORY_SLUGS)
      urls.push({ loc: editionUrl(config.siteUrl, lang, `/${slug}`) });
    for (const writer of WRITERS) {
      urls.push({ loc: editionUrl(config.siteUrl, lang, `/author/${authorSlug(writer.name)}`) });
    }
  }
  return urlset(urls);
}

/** One page of articles (newest first), each under its own edition. */
async function handleSitemapArticles(
  request: Request,
  config: Config,
  page: number,
): Promise<Response> {
  const result = await fetchLatestPage(config, request.signal, { page });
  return urlset(
    (result?.data ?? []).map((article) => ({
      loc: articleUrl(config, article),
      lastmod: article.updatedAt,
    })),
  );
}

/** Google News: only stories published in the last 48 hours, newest first. */
async function handleSitemapNews(request: Request, config: Config): Promise<Response> {
  const cutoff = Date.now() - NEWS_WINDOW_MS;
  const recent: PublicArticle[] = [];
  for (let page = 1; page <= NEWS_MAX_PAGES; page += 1) {
    const result = await fetchLatestPage(config, request.signal, { page });
    if (!result) break;
    const fresh = result.data.filter((a) => a.publishedAt && Date.parse(a.publishedAt) >= cutoff);
    recent.push(...fresh);
    // Newest first: once a page holds an older story, every later page is older.
    if (fresh.length < result.data.length || page >= result.pagination.totalPages) break;
  }
  return urlset(
    recent.map((a) => ({
      loc: articleUrl(config, a),
      news:
        `<news:news><news:publication><news:name>${escapeXml(SITE_NAME)}</news:name>` +
        `<news:language>${escapeXml(a.language)}</news:language></news:publication>` +
        `<news:publication_date>${escapeXml(a.publishedAt ?? '')}</news:publication_date>` +
        `<news:title>${escapeXml(a.title)}</news:title></news:news>`,
    })),
    true,
  );
}

/** RSS 2.0 for ONE edition, newest first, with the hero image as Media RSS. */
async function handleFeed(request: Request, config: Config, lang: Language): Promise<Response> {
  const result = await fetchLatestPage(config, request.signal, { page: 1, language: lang });
  const selfUrl = editionUrl(config.siteUrl, lang, '/feed.xml');
  const items = (result?.data ?? [])
    .map((a) => {
      const link = articleUrl(config, a);
      const image = articleImage(a);
      return (
        `    <item>\n` +
        `      <title>${escapeXml(a.title)}</title>\n` +
        `      <link>${escapeXml(link)}</link>\n` +
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>\n` +
        `      <dc:creator>${escapeXml(a.author)}</dc:creator>\n` +
        `      <category>${escapeXml(categoryLabel(a.category, a.language))}</category>\n` +
        (a.publishedAt
          ? `      <pubDate>${escapeXml(new Date(a.publishedAt).toUTCString())}</pubDate>\n`
          : '') +
        `      <description>${escapeXml(articleDescription(a))}</description>\n` +
        (image ? `      <media:content url="${escapeXml(image)}" medium="image" />\n` : '') +
        `    </item>`
      );
    })
    .join('\n');
  return xmlResponse(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" ` +
      `xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">\n` +
      `  <channel>\n` +
      `    <title>${escapeXml(SITE_NAME)}</title>\n` +
      `    <link>${escapeXml(editionUrl(config.siteUrl, lang, '/'))}</link>\n` +
      `    <atom:link href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml" />\n` +
      `    <description>${escapeXml(translate(lang, 'metaFeedDescription'))}</description>\n` +
      `    <language>${lang}</language>\n${items}\n  </channel>\n</rss>`,
    'application/rss+xml',
  );
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

    if (pathname === '/sitemap.xml') return handleSitemapIndex(request, config);
    if (pathname === '/sitemap-pages.xml') return handleSitemapPages(config);
    if (pathname === '/sitemap-news.xml') return handleSitemapNews(request, config);
    const articleSitemap = /^\/sitemap-articles-(\d+)\.xml$/.exec(pathname)?.[1];
    if (articleSitemap) return handleSitemapArticles(request, config, Number(articleSitemap));

    // Feeds are per edition: /feed.xml (and the legacy /rss.xml) is English.
    const feed = /^(?:\/([a-z]{2}))?\/(?:feed|rss)\.xml$/.exec(pathname);
    if (feed) {
      const feedLang = feed[1] ?? DEFAULT_LANGUAGE;
      if (isLanguage(feedLang)) return handleFeed(request, config, feedLang);
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

    const tag = /^\/tag\/([^/]+)\/?$/.exec(rest)?.[1];
    if (tag) {
      return handleTag(env, request, config, decodeURIComponent(tag), lang);
    }

    const staticPath = rest.length > 1 ? rest.replace(/\/$/, '') : rest;
    const staticPage = staticMeta(staticPath, lang);
    if (staticPage) {
      return handleStaticPage(env, request, config, staticPath, staticPage, lang);
    }

    const section = /^\/([^/]+)\/?$/.exec(rest)?.[1];
    if (section) {
      const slug = decodeURIComponent(section).toLowerCase();
      const category = CATEGORIES.find((c) => categorySlug(c) === slug);
      if (category) {
        return handleCategory(env, request, config, category, lang);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
