/**
 * Audit every PUBLISHED article's images against the production public API and
 * report which ones are broken, so the team can re-source them.
 *
 * For each article we check the hero image and any Markdown body images by doing
 * a full GET and running the SAME structural validator the upload pipeline now
 * uses (`@gwj/shared-types/image-validation`). Verdicts per image:
 *
 *   OK            — a complete, decodable image at/above the minimum size
 *   MISSING       — the article has no hero image at all (rule violation)
 *   HTTP-<status> — the URL did not return 200
 *   NOT-AN-IMAGE  — 200 but the bytes are not a recognized image
 *   TRUNCATED     — recognized but structurally incomplete (the shipped bug)
 *   CORRUPT       — recognized but failed CRC / zlib / framing checks
 *   TOO-SMALL     — a valid image below the minimum hero dimension
 *   MIME-MISMATCH — a valid, decodable image whose STORED content-type disagrees
 *                   with the real format (renders fine in browsers, but the
 *                   stored metadata is wrong) — informational, not "blank image"
 *
 * Structural validity is checked WITHOUT forcing the declared MIME to match, so
 * a perfectly good JPEG stored with a `.png` content-type is reported as
 * MIME-MISMATCH (cosmetic) rather than NOT-AN-IMAGE (broken). Only TRUNCATED,
 * CORRUPT, NOT-AN-IMAGE, MISSING and HTTP/FETCH errors mean the image is broken
 * for readers; TOO-SMALL and MIME-MISMATCH are quality/metadata issues.
 *
 * This script is READ-ONLY: it never mutates any data. It writes a human report
 * to scripts/audit-images-report.txt and prints a summary to stdout.
 *
 * Run with the command sandbox disabled if network egress is blocked:
 *   bun run scripts/audit-images.ts
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { validateImageBuffer } from '@gwj/shared-types/image-validation'

const API_BASE_URL = process.env.GWJ_API_BASE_URL ?? 'https://api.globalworldjournal.com'
const PAGE_LIMIT = 50 // the API caps `limit` at 50
const REQUEST_TIMEOUT_MS = 30_000
const REPORT_PATH = join(dirname(fileURLToPath(import.meta.url)), 'audit-images-report.txt')

type Verdict =
  | 'OK'
  | 'MISSING'
  | 'NOT-AN-IMAGE'
  | 'TRUNCATED'
  | 'CORRUPT'
  | 'TOO-SMALL'
  | 'MIME-MISMATCH'
  | `HTTP-${number}`
  | 'FETCH-ERROR'

/** Verdicts that mean the image is actually broken/blank for readers. */
const BROKEN_VERDICTS: ReadonlySet<Verdict> = new Set<Verdict>([
  'MISSING',
  'NOT-AN-IMAGE',
  'TRUNCATED',
  'CORRUPT',
  'FETCH-ERROR',
])

interface ImageRow {
  kind: 'hero' | 'body'
  url: string | null
  verdict: Verdict
  detail: string
}

interface ArticleRow {
  slug: string
  title: string
  images: ImageRow[]
}

interface ApiArticle {
  slug: string
  title: string
  body?: string
  heroImage?: { url?: string } | null
}

interface ApiPage {
  data: ApiArticle[]
  pagination: { page: number; totalPages: number; total: number }
}

/** Fetch one page of published articles from the public API. */
async function fetchPage(page: number): Promise<ApiPage> {
  const url = `${API_BASE_URL}/api/articles?page=${page}&limit=${PAGE_LIMIT}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`)
    return (await res.json()) as ApiPage
  } finally {
    clearTimeout(timer)
  }
}

/** Enumerate ALL published articles across every page. */
async function fetchAllArticles(): Promise<ApiArticle[]> {
  const first = await fetchPage(1)
  const articles = [...first.data]
  for (let page = 2; page <= first.pagination.totalPages; page++) {
    const next = await fetchPage(page)
    articles.push(...next.data)
  }
  return articles
}

/** Extract Markdown image URLs from an article body. */
function bodyImageUrls(body: string | undefined): string[] {
  if (!body) return []
  const urls: string[] = []
  const re = /!\[[^\]]*\]\(\s*(\S+?)(?:\s+["'][^)]*)?\s*\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(body)) !== null) {
    const url = match[1]
    if (url) urls.push(url)
  }
  return urls
}

/** Download an image URL fully and classify it with the shared validator. */
async function checkImage(url: string, kind: 'hero' | 'body'): Promise<ImageRow> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      return { kind, url, verdict: `HTTP-${res.status}`, detail: `status ${res.status}` }
    }
    const buffer = new Uint8Array(await res.arrayBuffer())
    const storedContentType = res.headers.get('content-type') ?? ''
    // Validate STRUCTURE first (does it decode, is it big enough) without forcing
    // the stored content-type to match — a wrong stored mime is a separate, less
    // severe issue than a corrupt/truncated image.
    const result = validateImageBuffer(buffer)
    if (!result.ok) {
      return { kind, url, verdict: mapReasonToVerdict(result.reason), detail: result.message }
    }
    // Structurally valid. Flag a stored content-type that disagrees with the real
    // format as MIME-MISMATCH (cosmetic) rather than masking it as OK.
    const normalizedStored = storedContentType.split(';')[0]?.trim().toLowerCase() ?? ''
    if (normalizedStored && normalizedStored !== result.mime) {
      return {
        kind,
        url,
        verdict: 'MIME-MISMATCH',
        detail: `decodes as ${result.format} ${result.width}x${result.height}, but stored content-type is "${storedContentType}"`,
      }
    }
    return {
      kind,
      url,
      verdict: 'OK',
      detail: `${result.format} ${result.width}x${result.height} ${result.byteLength}B`,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { kind, url, verdict: 'FETCH-ERROR', detail: message }
  } finally {
    clearTimeout(timer)
  }
}

function mapReasonToVerdict(reason: string): Verdict {
  switch (reason) {
    case 'truncated':
      return 'TRUNCATED'
    case 'corrupt':
    case 'undecodable-dimensions':
    case 'too-large':
      return 'CORRUPT'
    case 'too-small':
      return 'TOO-SMALL'
    case 'unknown-format':
    case 'empty':
      return 'NOT-AN-IMAGE'
    default:
      return 'NOT-AN-IMAGE'
  }
}

/** Audit a single article's hero and body images. */
async function auditArticle(article: ApiArticle): Promise<ArticleRow> {
  const images: ImageRow[] = []
  const heroUrl = article.heroImage?.url ?? null
  if (!heroUrl) {
    images.push({ kind: 'hero', url: null, verdict: 'MISSING', detail: 'no hero image on article' })
  } else {
    images.push(await checkImage(heroUrl, 'hero'))
  }
  for (const url of bodyImageUrls(article.body)) {
    images.push(await checkImage(url, 'body'))
  }
  return { slug: article.slug, title: article.title, images }
}

async function main(): Promise<void> {
  process.stdout.write(`Auditing images via ${API_BASE_URL} …\n`)
  const articles = await fetchAllArticles()
  process.stdout.write(`Fetched ${articles.length} published article(s). Checking images…\n`)

  const rows: ArticleRow[] = []
  for (const article of articles) {
    rows.push(await auditArticle(article))
  }

  const counts: Record<Verdict, number> = {} as Record<Verdict, number>
  const brokenSlugs = new Set<string>()
  const tooSmallSlugs = new Set<string>()
  const mimeMismatchSlugs = new Set<string>()
  const lines: string[] = []
  lines.push(`GWJ image audit — ${new Date().toISOString()}`)
  lines.push(`API: ${API_BASE_URL}`)
  lines.push(`Articles audited: ${articles.length}`)
  lines.push('')

  for (const row of rows) {
    for (const image of row.images) {
      counts[image.verdict] = (counts[image.verdict] ?? 0) + 1
      if (BROKEN_VERDICTS.has(image.verdict)) brokenSlugs.add(row.slug)
      else if (image.verdict === 'TOO-SMALL') tooSmallSlugs.add(row.slug)
      else if (image.verdict === 'MIME-MISMATCH') mimeMismatchSlugs.add(row.slug)
      lines.push(
        `[${image.verdict}] ${row.slug} (${image.kind})` +
          `\n    url: ${image.url ?? '(none)'}` +
          `\n    ${image.detail}`,
      )
    }
  }

  lines.push('')
  lines.push('=== SUMMARY ===')
  const verdicts = Object.keys(counts).sort() as Verdict[]
  for (const verdict of verdicts) {
    lines.push(`${verdict}: ${counts[verdict]}`)
  }
  lines.push('')
  appendSlugSection(lines, 'BROKEN — must re-source the image (renders blank/broken)', brokenSlugs)
  appendSlugSection(lines, 'TOO-SMALL — below minimum hero dimension', tooSmallSlugs)
  appendSlugSection(lines, 'MIME-MISMATCH — valid image, wrong stored content-type', mimeMismatchSlugs)

  const report = lines.join('\n') + '\n'
  writeFileSync(REPORT_PATH, report)

  // Echo just the summary to stdout (the full per-image list lives in the file).
  process.stdout.write('\n=== SUMMARY ===\n')
  for (const verdict of verdicts) process.stdout.write(`${verdict}: ${counts[verdict]}\n`)
  process.stdout.write(`\nBROKEN (must re-source): ${brokenSlugs.size} article(s)\n`)
  process.stdout.write(`TOO-SMALL: ${tooSmallSlugs.size} article(s)\n`)
  process.stdout.write(`MIME-MISMATCH (cosmetic): ${mimeMismatchSlugs.size} article(s)\n`)
  process.stdout.write(`Full report written to ${REPORT_PATH}\n`)
}

/** Append a titled list of slugs to the report lines (skips empty sections). */
function appendSlugSection(lines: string[], title: string, slugs: ReadonlySet<string>): void {
  lines.push(`${title}: ${slugs.size}`)
  for (const slug of [...slugs].sort()) lines.push(`  - ${slug}`)
  lines.push('')
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`audit-images failed: ${message}\n`)
  process.exit(1)
})
