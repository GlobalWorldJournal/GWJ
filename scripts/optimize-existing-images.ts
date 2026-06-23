/**
 * Backfill: optimize the hero and body images that are ALREADY live on
 * published GWJ articles. This is the fix for the Lighthouse report flagging
 * ~1 MB of oversized, non-WebP images (e.g. a 1920×1280 JPEG shown at 665×443).
 *
 * For each published article we:
 *   1. Download the current hero image (and any Markdown body images that live
 *      on our CDN, `cdn.globalworldjournal.com`).
 *   2. Skip images that are already small enough (longest edge ≤ MAX_LONGEST_EDGE)
 *      AND already WebP — they need nothing.
 *   3. Otherwise resize (longest edge ≤ MAX_LONGEST_EDGE) + re-encode to WebP
 *      (q80) with sharp — the SAME `optimizeToWebp` the upload pipeline uses, so
 *      backfilled images match future uploads. (The deployed upload endpoint does
 *      NOT yet apply that step, so this script does the work client-side.)
 *   4. Upload the optimized bytes to `POST /api/admin/upload` (multipart `file`),
 *      which returns a NEW immutable CDN key — we never overwrite the old key, so
 *      the old URL keeps serving from cache and there is zero downtime.
 *   5. Verify the new URL returns HTTP 200 + `image/webp` BEFORE pointing the
 *      article at it.
 *   6. PATCH the article with the new `heroImage.url` (preserving alt/caption/
 *      credit) and the body rewritten to reference the new body-image URLs.
 *
 * Safety / idempotency:
 *   - READ-ONLY against anything not ours: images NOT on our CDN are skipped.
 *   - Already-optimized images are skipped (no re-upload, no PATCH).
 *   - Nothing is ever deleted. Old keys remain valid (immutable cache).
 *   - If ANY image on an article fails, that article is skipped entirely (its
 *     body/hero stay internally consistent) and the run continues.
 *   - Re-running is safe: optimized WebP images are detected and skipped.
 *
 * Auth: reads a JWT from `<scratchpad>/jwt`. On 401 it re-logs in via
 * `POST /api/auth/login` with username `nate` + the password in
 * `<scratchpad>/admin_pw`, and saves the refreshed token back to `<scratchpad>/jwt`.
 *
 * Run with the command sandbox DISABLED (network egress + local file writes):
 *   bun run scripts/optimize-existing-images.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateImageBuffer } from '@gwj/shared-types/image-validation'
import {
  MAX_LONGEST_EDGE,
  WEBP_MIME,
  optimizeToWebp,
  readImageMetadata,
} from '../packages/backend/src/services/imageOptimizer'

const API_BASE_URL = (process.env.GWJ_API_BASE_URL ?? 'https://api.globalworldjournal.com').replace(
  /\/+$/,
  '',
)
/** Only images served from this host are ours to re-host. */
const CDN_HOST = process.env.GWJ_CDN_HOST ?? 'cdn.globalworldjournal.com'
const PAGE_LIMIT = 50 // the API caps `limit` at 50
const REQUEST_TIMEOUT_MS = 60_000
const SCRATCHPAD =
  process.env.GWJ_SCRATCHPAD ??
  '/tmp/claude-1000/-home-nate/9823b459-1fd6-4e1d-a848-2151697f8934/scratchpad'
const JWT_PATH = join(SCRATCHPAD, 'jwt')
const ADMIN_PW_PATH = join(SCRATCHPAD, 'admin_pw')
const ADMIN_USERNAME = 'nate'

interface ApiHeroImage {
  url?: string
  alt?: string
  caption?: string
  credit?: string
}

interface ApiArticle {
  id: string
  slug: string
  title: string
  body?: string
  heroImage?: ApiHeroImage | null
}

interface ApiPage {
  data: ApiArticle[]
  pagination: { page: number; totalPages: number; total: number }
}

/** Read the current JWT from disk (may be empty/expired — refreshed on demand). */
function readToken(): string {
  try {
    return readFileSync(JWT_PATH, 'utf8').trim()
  } catch {
    return ''
  }
}

/** Log in as the admin and persist the fresh token to disk. Returns the token. */
async function login(): Promise<string> {
  const password = readFileSync(ADMIN_PW_PATH, 'utf8').trim()
  if (password.length === 0) {
    throw new Error(`admin password file ${ADMIN_PW_PATH} is empty`)
  }
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USERNAME, password }),
  })
  if (!res.ok) {
    throw new Error(`login failed: HTTP ${res.status} ${await res.text()}`)
  }
  const data = (await res.json()) as { token?: string }
  if (!data.token) throw new Error('login response did not include a token')
  writeFileSync(JWT_PATH, data.token)
  process.stdout.write('Re-authenticated and saved a fresh admin token.\n')
  return data.token
}

let token = readToken()

/**
 * Issue an authenticated request, transparently re-logging in once on a 401 so a
 * stale token in the scratchpad does not abort a long backfill.
 */
async function authedFetch(path: string, init: RequestInit): Promise<Response> {
  const send = (bearer: string): Promise<Response> =>
    fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${bearer}` },
    })
  if (token.length === 0) token = await login()
  let res = await send(token)
  if (res.status === 401) {
    token = await login()
    res = await send(token)
  }
  return res
}

/** Fetch one page of published articles from the public API. */
async function fetchPage(page: number): Promise<ApiPage> {
  const url = `${API_BASE_URL}/api/articles?page=${page}&limit=${PAGE_LIMIT}`
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`)
  return (await res.json()) as ApiPage
}

/** Enumerate ALL published articles across every page. */
async function fetchAllArticles(): Promise<ApiArticle[]> {
  const first = await fetchPage(1)
  const articles = [...first.data]
  for (let page = 2; page <= first.pagination.totalPages; page++) {
    articles.push(...(await fetchPage(page)).data)
  }
  return articles
}

/**
 * Extract Markdown image URLs from an article body, each with the exact source
 * substring so we can do a precise, unambiguous replacement later.
 */
interface BodyImageRef {
  /** The full URL inside the Markdown image syntax. */
  url: string
  /** The exact `(url ...)` inner token as it appears, for a precise replace. */
  rawUrl: string
}

function bodyImageRefs(body: string | undefined): BodyImageRef[] {
  if (!body) return []
  const refs: BodyImageRef[] = []
  const re = /!\[[^\]]*\]\(\s*(\S+?)(?:\s+["'][^)]*)?\s*\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(body)) !== null) {
    const url = match[1]
    if (url) refs.push({ url, rawUrl: url })
  }
  return refs
}

/** Is this URL served from our own CDN (i.e. ours to re-host)? */
function isOnOurCdn(url: string): boolean {
  try {
    return new URL(url).hostname === CDN_HOST
  } catch {
    return false
  }
}

interface DownloadedImage {
  bytes: Buffer
  contentType: string
}

/** Download an image URL fully. Throws on non-200. */
async function download(url: string): Promise<DownloadedImage> {
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`download ${url} → HTTP ${res.status}`)
  return {
    bytes: Buffer.from(await res.arrayBuffer()),
    contentType: (res.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '',
  }
}

/** Result of (maybe) optimizing one image URL. */
type OptimizeOutcome =
  | { kind: 'skipped'; reason: string; bytes: number }
  | { kind: 'optimized'; newUrl: string; before: number; after: number }

/**
 * Optimize a single image URL: download, decide if it needs work, optimize +
 * upload + verify, and return the new CDN URL. GIFs are left untouched (animation
 * must not be flattened). Throws on any hard failure so the caller can skip the
 * whole article.
 */
async function optimizeImage(url: string): Promise<OptimizeOutcome> {
  if (!isOnOurCdn(url)) {
    return { kind: 'skipped', reason: 'not on our CDN', bytes: 0 }
  }

  const { bytes } = await download(url)
  // Gate on the shared validator: a source image that is corrupt, truncated, or
  // below the usable hero size is left untouched (reported as a failure to fix at
  // the source), never re-uploaded as a broken/tiny WebP.
  const validation = validateImageBuffer(bytes)
  if (!validation.ok) {
    throw new Error(`current image is not a valid image (${validation.reason}): ${validation.message}`)
  }

  // Decide whether work is needed using SHARP's view of the image — the same
  // engine that produces the output — so the skip threshold and the resize agree
  // exactly. (The structural validator can disagree with sharp by a pixel on
  // WebP dimensions, which would make this backfill re-optimize forever.)
  const meta = await readImageMetadata(bytes)
  // Animated GIFs must not be flattened to a single WebP frame; leave as-is.
  if (meta.format === 'gif') {
    return { kind: 'skipped', reason: 'gif (animation preserved)', bytes: bytes.byteLength }
  }
  // Already small enough AND already WebP → nothing to do (idempotent skip).
  if (meta.format === 'webp' && meta.longestEdge <= MAX_LONGEST_EDGE) {
    return { kind: 'skipped', reason: 'already webp and within size', bytes: bytes.byteLength }
  }

  const optimized = await optimizeToWebp(bytes)
  const before = bytes.byteLength
  const after = optimized.buffer.byteLength

  // Upload the optimized bytes; the endpoint returns a NEW immutable CDN key.
  const form = new FormData()
  // Wrap in a fresh Uint8Array so the Blob part is a plain ArrayBuffer-backed
  // view (Node's `Buffer` can be SharedArrayBuffer-backed, which `BlobPart` rejects).
  const part = new Uint8Array(optimized.buffer)
  form.append('file', new Blob([part], { type: WEBP_MIME }), 'optimized.webp')
  const uploadRes = await authedFetch('/api/admin/upload', { method: 'POST', body: form })
  if (!uploadRes.ok) {
    throw new Error(`upload failed: HTTP ${uploadRes.status} ${await uploadRes.text()}`)
  }
  const { url: newUrl } = (await uploadRes.json()) as { url: string }
  if (!newUrl) throw new Error('upload response did not include a url')

  // Verify the new asset is live and truly WebP BEFORE we point the article at it.
  const check = await fetch(newUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!check.ok) throw new Error(`new image ${newUrl} returned HTTP ${check.status}`)
  const checkType = (check.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase()
  if (checkType !== WEBP_MIME) {
    throw new Error(`new image ${newUrl} has content-type "${checkType}", expected ${WEBP_MIME}`)
  }

  return { kind: 'optimized', newUrl, before, after }
}

interface ArticleResult {
  slug: string
  status: 'updated' | 'skipped' | 'failed'
  detail: string
  bytesBefore: number
  bytesAfter: number
}

/** Process a single article: optimize hero + body images, then PATCH if changed. */
async function processArticle(article: ApiArticle): Promise<ArticleResult> {
  const patch: { heroImage?: ApiHeroImage; body?: string } = {}
  let bytesBefore = 0
  let bytesAfter = 0
  const changes: string[] = []

  // --- Hero image ---
  const heroUrl = article.heroImage?.url
  if (heroUrl) {
    const outcome = await optimizeImage(heroUrl)
    if (outcome.kind === 'optimized') {
      // Preserve all other hero fields (alt/caption/credit); only swap the url.
      patch.heroImage = { ...article.heroImage, url: outcome.newUrl }
      bytesBefore += outcome.before
      bytesAfter += outcome.after
      changes.push(`hero ${outcome.before}→${outcome.after}B`)
    }
  }

  // --- Body images (Markdown) ---
  const refs = bodyImageRefs(article.body)
  let newBody = article.body ?? ''
  let bodyChanged = false
  for (const ref of refs) {
    const outcome = await optimizeImage(ref.url)
    if (outcome.kind === 'optimized') {
      // Replace every occurrence of the exact source URL token in the body.
      newBody = newBody.split(ref.rawUrl).join(outcome.newUrl)
      bodyChanged = true
      bytesBefore += outcome.before
      bytesAfter += outcome.after
      changes.push(`body ${outcome.before}→${outcome.after}B`)
    }
  }
  if (bodyChanged) patch.body = newBody

  if (!patch.heroImage && patch.body === undefined) {
    return { slug: article.slug, status: 'skipped', detail: 'nothing to optimize', bytesBefore: 0, bytesAfter: 0 }
  }

  const res = await authedFetch(`/api/admin/articles/${article.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    throw new Error(`PATCH article failed: HTTP ${res.status} ${await res.text()}`)
  }
  return {
    slug: article.slug,
    status: 'updated',
    detail: changes.join(', '),
    bytesBefore,
    bytesAfter,
  }
}

function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`
}

async function main(): Promise<void> {
  process.stdout.write(`Optimizing existing images via ${API_BASE_URL} …\n`)
  const articles = await fetchAllArticles()
  process.stdout.write(`Fetched ${articles.length} published article(s).\n\n`)

  const results: ArticleResult[] = []
  for (const article of articles) {
    try {
      const result = await processArticle(article)
      results.push(result)
      if (result.status === 'updated') {
        process.stdout.write(
          `[UPDATED] ${article.slug}\n` +
            `    ${result.detail}\n` +
            `    before ${formatKb(result.bytesBefore)} → after ${formatKb(result.bytesAfter)}\n`,
        )
      } else {
        process.stdout.write(`[SKIPPED] ${article.slug} (${result.detail})\n`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      results.push({
        slug: article.slug,
        status: 'failed',
        detail: message,
        bytesBefore: 0,
        bytesAfter: 0,
      })
      process.stderr.write(`[FAILED]  ${article.slug}: ${message}\n`)
    }
  }

  const updated = results.filter((r) => r.status === 'updated')
  const skipped = results.filter((r) => r.status === 'skipped')
  const failed = results.filter((r) => r.status === 'failed')
  const totalBefore = updated.reduce((sum, r) => sum + r.bytesBefore, 0)
  const totalAfter = updated.reduce((sum, r) => sum + r.bytesAfter, 0)
  const saved = totalBefore - totalAfter

  process.stdout.write('\n=== SUMMARY ===\n')
  process.stdout.write(`Articles processed: ${results.length}\n`)
  process.stdout.write(`  updated: ${updated.length}\n`)
  process.stdout.write(`  skipped: ${skipped.length}\n`)
  process.stdout.write(`  failed:  ${failed.length}\n`)
  process.stdout.write(
    `Total image bytes: ${formatKb(totalBefore)} → ${formatKb(totalAfter)} ` +
      `(saved ${formatKb(saved)})\n`,
  )
  if (failed.length > 0) {
    process.stdout.write('\nFailed articles (skipped, left unchanged):\n')
    for (const r of failed) process.stdout.write(`  - ${r.slug}: ${r.detail}\n`)
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`optimize-existing-images failed: ${message}\n`)
  process.exit(1)
})
