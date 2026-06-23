// Cloudflare Pages Advanced-Mode worker (served at the root of dist/).
// For crawler-facing routes it fetches the backend API and injects per-page
// <title>, meta description, Open Graph, Twitter card and JSON-LD into the SPA
// shell. It also generates /sitemap.xml. Everything else falls through to the
// static assets (which honor _redirects → SPA fallback).

const CATEGORY_SLUGS = ['world', 'business', 'markets', 'tech', 'politics', 'opinion', 'arts']
const SITE_NAME = 'Global World Journal'

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

function buildMetaTags({ title, description, url, image, type, jsonLd }) {
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<meta property="og:type" content="${escapeHtml(type)}" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
  ]
  if (image) {
    tags.push(`<meta property="og:image" content="${escapeHtml(image)}" />`)
    tags.push(`<meta name="twitter:image" content="${escapeHtml(image)}" />`)
  }
  if (jsonLd) {
    tags.push(
      `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`,
    )
  }
  return tags.join('\n    ')
}

// Replace the shell's <title> and inject our SEO tags before </head>.
function injectHead(html, metaTags) {
  let output = html.replace(/<title>[\s\S]*?<\/title>/i, '')
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

function newsArticleJsonLd(article, url, image) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    description: articleDescription(article),
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    articleSection: article.category,
    author: { '@type': 'Person', name: article.author },
    publisher: { '@type': 'Organization', name: SITE_NAME },
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
  const shellUrl = new URL('/index.html', new URL(request.url).origin)
  return env.ASSETS.fetch(new Request(shellUrl.toString(), request))
}

function withHtmlBody(shellResponse, html) {
  const headers = new Headers(shellResponse.headers)
  headers.set('content-type', 'text/html; charset=utf-8')
  return new Response(html, { status: 200, headers })
}

async function handleHome(env, request, config) {
  const shell = await getShell(env, request)
  const html = await shell.text()
  const metaTags = buildMetaTags({
    title: `${SITE_NAME} — World, Business, Markets, Tech, Politics, Opinion, Arts`,
    description: `${SITE_NAME}: breaking news and in-depth reporting across the world economy, markets, technology, politics, opinion and the arts.`,
    url: `${config.siteUrl}/`,
    image: '',
    type: 'website',
    jsonLd: websiteJsonLd(config.siteUrl),
  })
  return withHtmlBody(shell, injectHead(html, metaTags))
}

async function handleArticle(env, request, config, slug) {
  const shell = await getShell(env, request)
  const html = await shell.text()
  const article = config.apiBaseUrl
    ? await fetchJson(`${config.apiBaseUrl}/api/articles/${encodeURIComponent(slug)}`, request.signal)
    : null

  if (!article || !article.title) {
    // Article unknown to the edge — serve the shell so the SPA can 404 client-side.
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
        }),
      ),
    )
  }

  const url = `${config.siteUrl}/article/${article.slug || slug}`
  const description = articleDescription(article)
  const image = articleImage(article)
  const title = (article.seo && article.seo.metaTitle) || `${article.title} — ${SITE_NAME}`

  const metaTags = buildMetaTags({
    title,
    description,
    url,
    image,
    type: 'article',
    jsonLd: newsArticleJsonLd(article, url, image),
  })
  return withHtmlBody(shell, injectHead(html, metaTags))
}

async function handleCategory(env, request, config, slug) {
  const shell = await getShell(env, request)
  const html = await shell.text()
  const name = slug.charAt(0).toUpperCase() + slug.slice(1)
  const metaTags = buildMetaTags({
    title: `${name} — ${SITE_NAME}`,
    description: `The latest ${name} news and analysis from ${SITE_NAME}.`,
    url: `${config.siteUrl}/${slug}`,
    image: '',
    type: 'website',
    jsonLd: websiteJsonLd(config.siteUrl),
  })
  return withHtmlBody(shell, injectHead(html, metaTags))
}

async function handleSitemap(request, config) {
  const entries = [`${config.siteUrl}/`]
  for (const slug of CATEGORY_SLUGS) {
    entries.push(`${config.siteUrl}/${slug}`)
  }

  if (config.apiBaseUrl) {
    const payload = await fetchJson(
      `${config.apiBaseUrl}/api/articles?limit=50&page=1`,
      request.signal,
    )
    const articles = payload && Array.isArray(payload.data) ? payload.data : []
    for (const article of articles) {
      if (article && article.slug) {
        entries.push(`${config.siteUrl}/article/${article.slug}`)
      }
    }
  }

  const urls = entries
    .map((loc) => `  <url><loc>${escapeXml(loc)}</loc></url>`)
    .join('\n')
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/xml; charset=utf-8' },
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
