// Cloudflare Pages Advanced-Mode worker (served at the root of dist/).
// For crawler-facing routes it fetches the backend API and injects per-page
// <title>, meta description, Open Graph, Twitter card and JSON-LD into the SPA
// shell. It also generates /sitemap.xml. Everything else falls through to the
// static assets (which honor _redirects → SPA fallback).

const CATEGORY_SLUGS = ['world', 'business', 'markets', 'tech', 'politics', 'opinion', 'arts']
const SITE_NAME = 'The Global World Journal'
const LANGS = ['en', 'es', 'fr']
const LOCALES = { en: 'en_US', es: 'es_ES', fr: 'fr_FR' }

/** The requested edition from ?lang=, validated; defaults to English. */
function langOf(request) {
  const l = new URL(request.url).searchParams.get('lang')
  return l && LANGS.includes(l) ? l : 'en'
}

/** hreflang alternate links for a clean canonical URL (query-param editions + x-default). */
function hreflangLinks(url) {
  const links = LANGS.map(
    (l) => `<link rel="alternate" hreflang="${l}" href="${escapeHtml(`${url}?lang=${l}`)}" />`,
  )
  links.push(`<link rel="alternate" hreflang="x-default" href="${escapeHtml(url)}" />`)
  return links.join('\n    ')
}

function getConfig(env) {
  const apiBaseUrl = (env && env.API_BASE_URL ? String(env.API_BASE_URL) : '').replace(/\/$/, '')
  const siteUrl = (env && env.SITE_URL ? String(env.SITE_URL) : 'https://globalworldjournal.com').replace(
    /\/$/,
    '',
  )
  return { apiBaseUrl, siteUrl }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

async function fetchJson(url, signal) {
  try {
    const response = await fetch(url, { signal, headers: { accept: 'application/json' } })
    if (!response.ok) {
      return null
    }
    return await response.json()
  } catch {
    return null
  }
}

function articleDescription(article) {
  if (article.seo && article.seo.metaDescription) {
    return article.seo.metaDescription
  }
  if (article.deck) {
    return article.deck
  }
  const firstParagraph = Array.isArray(article.body)
    ? article.body.find((block) => block && block.type === 'paragraph')
    : null
  if (firstParagraph && firstParagraph.text) {
    return firstParagraph.text.slice(0, 200)
  }
  return `${SITE_NAME} — ${article.title}`
}

function articleImage(article) {
  if (article.seo && article.seo.ogImage) {
    return article.seo.ogImage
  }
  if (article.heroImage && article.heroImage.url) {
    return article.heroImage.url
  }
  return ''
}

function slugifyName(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function buildMetaTags({ title, description, url, image, type, jsonLd, extraMeta = [], lang = 'en' }) {
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    hreflangLinks(url),
    `<meta property="og:type" content="${escapeHtml(type)}" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:locale" content="${LOCALES[lang] || 'en_US'}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:site" content="@globalworldjrnl" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
  ]
  if (image) {
    tags.push(`<meta property="og:image" content="${escapeHtml(image)}" />`)
    tags.push(`<meta name="twitter:image" content="${escapeHtml(image)}" />`)
  }
  for (const m of extraMeta) {
    tags.push(`<meta property="${escapeHtml(m.property)}" content="${escapeHtml(m.content)}" />`)
  }
  if (jsonLd) {
    const blocks = Array.isArray(jsonLd) ? jsonLd : [jsonLd]
    for (const block of blocks) {
      tags.push(
        `<script type="application/ld+json">${JSON.stringify(block).replace(/</g, '\\u003c')}</script>`,
      )
    }
  }
  return tags.join('\n    ')
}

function organizationJsonLd(siteUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsMediaOrganization',
    name: SITE_NAME,
    url: `${siteUrl}/`,
    logo: { '@type': 'ImageObject', url: `${siteUrl}/favicon.svg` },
    sameAs: [],
  }
}

// Replace the shell's <title> and inject our SEO tags before </head>.
function injectHead(html, metaTags, lang = 'en') {
  // Reflect the edition on the root element so crawlers without JS see the
  // correct language.
  let output = html.replace(/<html lang="[^"]*"/i, `<html lang="${lang}"`)
  output = output.replace(/<title>[\s\S]*?<\/title>/i, '')
  // Drop the static default description so we don't emit two.
  output = output.replace(/<meta\s+name=["']description["'][^>]*>/i, '')
  if (output.includes('</head>')) {
    return output.replace('</head>', `    ${metaTags}\n  </head>`)
  }
  return output
}

function websiteJsonLd(siteUrl) {
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
  }
}

function newsArticleJsonLd(article, url, image, siteUrl) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    description: articleDescription(article),
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    articleSection: article.category,
    author: {
      '@type': 'Person',
      name: article.author,
      url: `${siteUrl}/author/${slugifyName(article.author)}`,
    },
    publisher: {
      '@type': 'NewsMediaOrganization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: `${siteUrl}/favicon.svg` },
    },
  }
  if (article.kicker) {
    jsonLd.alternativeHeadline = article.deck || article.kicker
  }
  if (article.publishedAt) {
    jsonLd.datePublished = article.publishedAt
  }
  if (article.updatedAt) {
    jsonLd.dateModified = article.updatedAt
  }
  if (image) {
    jsonLd.image = [image]
  }
  return jsonLd
}

async function getShell(env, request) {
  // Fetch the SPA shell from the static-asset server. Request "/" (NOT
  // "/index.html") — Cloudflare Pages 308-redirects /index.html → / , and
  // env.ASSETS.fetch does not follow that redirect, which would yield an empty
  // body. "/" is served as index.html with 200. ASSETS never re-invokes this
  // worker, so there is no loop.
  const origin = new URL(request.url).origin
  return env.ASSETS.fetch(new Request(`${origin}/`, request))
}

function withHtmlBody(shellResponse, html) {
  const headers = new Headers(shellResponse.headers)
  headers.set('content-type', 'text/html; charset=utf-8')
  // Drop headers that no longer match the rewritten body.
  headers.delete('content-length')
  headers.delete('content-encoding')
  headers.delete('location')
  return new Response(html, { status: 200, headers })
}

async function handleHome(env, request, config) {
  const shell = await getShell(env, request)
  const html = await shell.text()
  const lang = langOf(request)
  const metaTags = buildMetaTags({
    title: `${SITE_NAME} — World, Business, Markets, Tech, Politics, Opinion, Arts`,
    description: `${SITE_NAME}: breaking news and in-depth reporting across the world economy, markets, technology, politics, opinion and the arts.`,
    url: `${config.siteUrl}/`,
    image: '',
    type: 'website',
    jsonLd: [websiteJsonLd(config.siteUrl), organizationJsonLd(config.siteUrl)],
    lang,
  })
  return withHtmlBody(shell, injectHead(html, metaTags, lang))
}

async function handleArticle(env, request, config, slug) {
  const shell = await getShell(env, request)
  const html = await shell.text()
  const article = config.apiBaseUrl
    ? await fetchJson(`${config.apiBaseUrl}/api/articles/${encodeURIComponent(slug)}`, request.signal)
    : null

  if (!article || !article.title) {
    // Article unknown to the edge — serve the shell so the SPA can 404 client-side.
    const reqLang = langOf(request)
    return withHtmlBody(
      shell,
      injectHead(
        html,
        buildMetaTags({
          title: SITE_NAME,
          description: `${SITE_NAME} — independent global news.`,
          url: `${config.siteUrl}/article/${slug}`,
          image: '',
          type: 'website',
          jsonLd: websiteJsonLd(config.siteUrl),
          lang: reqLang,
        }),
        reqLang,
      ),
    )
  }

  const lang = article.language && LOCALES[article.language] ? article.language : langOf(request)

  const url = `${config.siteUrl}/article/${article.slug || slug}`
  const description = articleDescription(article)
  const image = articleImage(article)
  const title = (article.seo && article.seo.metaTitle) || `${article.title} — ${SITE_NAME}`

  const extraMeta = [
    { property: 'article:section', content: article.category },
    { property: 'article:author', content: article.author },
  ]
  if (article.publishedAt) {
    extraMeta.push({ property: 'article:published_time', content: article.publishedAt })
  }
  if (article.updatedAt) {
    extraMeta.push({ property: 'article:modified_time', content: article.updatedAt })
  }
  const metaTags = buildMetaTags({
    title,
    description,
    url,
    image,
    type: 'article',
    jsonLd: newsArticleJsonLd(article, url, image, config.siteUrl),
    extraMeta,
    lang,
  })
  return withHtmlBody(shell, injectHead(html, metaTags, lang))
}

async function handleCategory(env, request, config, slug) {
  const shell = await getShell(env, request)
  const html = await shell.text()
  const lang = langOf(request)
  const name = slug.charAt(0).toUpperCase() + slug.slice(1)
  const metaTags = buildMetaTags({
    title: `${name} — ${SITE_NAME}`,
    description: `The latest ${name} news and analysis from ${SITE_NAME}.`,
    url: `${config.siteUrl}/${slug}`,
    image: '',
    type: 'website',
    jsonLd: websiteJsonLd(config.siteUrl),
    lang,
  })
  return withHtmlBody(shell, injectHead(html, metaTags, lang))
}

async function fetchArticles(config, request) {
  if (!config.apiBaseUrl) return []
  const payload = await fetchJson(`${config.apiBaseUrl}/api/articles?limit=50&page=1`, request.signal)
  return payload && Array.isArray(payload.data) ? payload.data : []
}

async function handleSitemap(request, config) {
  const articles = await fetchArticles(config, request)
  const staticUrls = [
    { loc: `${config.siteUrl}/` },
    ...CATEGORY_SLUGS.map((slug) => ({ loc: `${config.siteUrl}/${slug}` })),
  ]
  const authorSlugs = [...new Set(articles.map((a) => slugifyName(a.author)).filter(Boolean))]
  const authorUrls = authorSlugs.map((s) => ({ loc: `${config.siteUrl}/author/${s}` }))

  const articleUrls = articles
    .filter((a) => a && a.slug)
    .map((a) => {
      const lastmod = a.updatedAt || a.publishedAt
      const news = a.publishedAt
        ? `<news:news><news:publication><news:name>${escapeXml(SITE_NAME)}</news:name>` +
          `<news:language>en</news:language></news:publication>` +
          `<news:publication_date>${escapeXml(a.publishedAt)}</news:publication_date>` +
          `<news:title>${escapeXml(a.title)}</news:title></news:news>`
        : ''
      return {
        loc: `${config.siteUrl}/article/${a.slug}`,
        lastmod,
        news,
      }
    })

  const all = [...staticUrls, ...authorUrls, ...articleUrls]
  const urls = all
    .map((u) => {
      const parts = [`<loc>${escapeXml(u.loc)}</loc>`]
      if (u.lastmod) parts.push(`<lastmod>${escapeXml(u.lastmod)}</lastmod>`)
      if (u.news) parts.push(u.news)
      return `  <url>${parts.join('')}</url>`
    })
    .join('\n')
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ` +
    `xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${urls}\n</urlset>`
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  })
}

async function handleFeed(request, config) {
  const articles = await fetchArticles(config, request)
  const items = articles
    .filter((a) => a && a.slug)
    .map((a) => {
      const link = `${config.siteUrl}/article/${a.slug}`
      const date = a.publishedAt ? new Date(a.publishedAt).toUTCString() : ''
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
      )
    })
    .join('\n')
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">\n` +
    `  <channel>\n` +
    `    <title>${escapeXml(SITE_NAME)}</title>\n` +
    `    <link>${escapeXml(config.siteUrl)}/</link>\n` +
    `    <description>Breaking news and in-depth reporting from ${escapeXml(SITE_NAME)}.</description>\n` +
    `    <language>en</language>\n${items}\n  </channel>\n</rss>`
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
  })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const { pathname } = url
    const config = getConfig(env)

    if (request.method !== 'GET') {
      return env.ASSETS.fetch(request)
    }

    if (pathname === '/sitemap.xml') {
      return handleSitemap(request, config)
    }

    if (pathname === '/feed.xml' || pathname === '/rss.xml') {
      return handleFeed(request, config)
    }

    // Never prerender the admin app.
    if (pathname === '/' ) {
      return handleHome(env, request, config)
    }

    const articleMatch = pathname.match(/^\/article\/([^/]+)\/?$/)
    if (articleMatch) {
      return handleArticle(env, request, config, decodeURIComponent(articleMatch[1]))
    }

    const categoryMatch = pathname.match(/^\/([^/]+)\/?$/)
    if (categoryMatch) {
      const slug = decodeURIComponent(categoryMatch[1]).toLowerCase()
      if (CATEGORY_SLUGS.includes(slug)) {
        return handleCategory(env, request, config, slug)
      }
    }

    return env.ASSETS.fetch(request)
  },
}
