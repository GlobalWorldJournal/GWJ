import type { Category } from './category'
import { slugify } from './article'

/**
 * The Global World Journal masthead — a roster of (fictional) staff writers,
 * each an AI agent. A writer can cover MULTIPLE sections. The MCP server
 * exposes this roster (list_writers) and assigns a byline from it; the writing
 * agent picks a writer whose beats include the story's section.
 */
export interface Writer {
  name: string
  /** Sections this writer covers (one or more). */
  beats: readonly Category[]
  /** Short title shown on author pages / bylines. */
  title: string
}

export const WRITERS: readonly Writer[] = [
  { name: 'Eleanor Vance', beats: ['Markets', 'Business'], title: 'Senior Markets Correspondent' },
  { name: 'Ji-ho Park', beats: ['Markets', 'Tech'], title: 'Asia Markets & Tech Reporter' },
  { name: 'Daniel Okafor', beats: ['Business', 'Markets'], title: 'Business Editor' },
  { name: 'Priya Nair', beats: ['Business', 'World'], title: 'Global Business Correspondent' },
  { name: 'Marcus Lin', beats: ['Tech', 'Business'], title: 'Technology Correspondent' },
  { name: 'Ada Whitfield', beats: ['Tech', 'Markets'], title: 'AI & Semiconductors Reporter' },
  { name: 'Sofia Marchetti', beats: ['World', 'Politics'], title: 'Foreign Correspondent' },
  { name: 'Harper Reyes', beats: ['World', 'Politics'], title: 'Diplomatic Correspondent' },
  { name: 'Thomas Brennan', beats: ['Politics', 'World'], title: 'National Politics Reporter' },
  { name: 'Lucía Ferrer', beats: ['Politics', 'Business'], title: 'Legal & Policy Reporter' },
  { name: 'J. P. Sutherland', beats: ['Opinion', 'Markets'], title: 'Columnist' },
  { name: 'Margaret Holloway', beats: ['Opinion', 'World'], title: 'Editorial Board' },
  { name: 'Camille Dubois', beats: ['Arts', 'Opinion'], title: 'Culture Critic' },
  { name: 'Oliver Bennett', beats: ['Arts', 'World'], title: 'Books & Film Reporter' },
  { name: 'Nathan Cole', beats: ['World', 'Business', 'Politics'], title: 'Senior Writer at Large' },
  { name: 'Yuki Tanaka', beats: ['Tech', 'Markets', 'World'], title: 'Global Technology Correspondent' },
  { name: 'Amara Diallo', beats: ['World', 'Arts'], title: 'Features Correspondent' },
  { name: 'Robert Hale', beats: ['Markets', 'Business', 'Politics'], title: 'Economics Correspondent' },
] as const

/** Stable, dependency-free string hash (FNV-1a) for deterministic picks. */
function hash(value: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Writers whose beats include a section. */
export function writersForCategory(category: Category): Writer[] {
  return WRITERS.filter((w) => w.beats.includes(category))
}

/**
 * Choose a writer for a category. Deterministic given `seed` (e.g. the article
 * title) so the same story always gets the same byline; rotates among the
 * writers covering that beat. Falls back to the full roster if none match.
 */
export function pickWriter(category: Category, seed = ''): Writer {
  const onBeat = writersForCategory(category)
  const pool = onBeat.length > 0 ? onBeat : WRITERS
  const index = hash(`${category}:${seed}`) % pool.length
  return pool[index] ?? pool[0] ?? WRITERS[0]!
}

/** URL slug for an author byline, e.g. "Eleanor Vance" -> "eleanor-vance". */
export function authorSlug(name: string): string {
  return slugify(name)
}

/** Resolve an author-page slug back to a roster writer, if it is one. */
export function findWriterBySlug(slug: string): Writer | undefined {
  return WRITERS.find((w) => authorSlug(w.name) === slug)
}

/** Resolve a roster writer by exact display name (the article `author` field). */
export function findWriterByName(name: string): Writer | undefined {
  return WRITERS.find((w) => w.name === name)
}

/**
 * The fediverse username (local handle) for a writer's ActivityPub actor.
 * Unlike `authorSlug` (a hyphenated WEB slug), a fedi username is a bare token of
 * ONLY `[a-z0-9]` — no spaces, hyphens, dots, or accents — so it forms a valid
 * Mastodon-style handle `@<fediUsername>@<domain>`. Diacritics are stripped via
 * NFKD before non-alphanumerics are removed.
 *
 * Examples: "Eleanor Vance"→"eleanorvance", "Ji-ho Park"→"jihopark",
 * "J. P. Sutherland"→"jpsutherland", "Lucía Ferrer"→"luciaferrer".
 */
export function fediUsername(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/** Resolve a roster writer by their fediverse username, if it is one. */
export function findWriterByFediUsername(username: string): Writer | undefined {
  return WRITERS.find((w) => fediUsername(w.name) === username)
}

/**
 * CDN-relative path to a writer's avatar (512×512 PNG, pre-generated, one per
 * writer). Pure and env-free: the consumer joins it with the CDN base URL. The
 * path key is the writer's `fediUsername`, e.g. `writers/eleanorvance.png`.
 */
export function writerAvatarPath(name: string): string {
  return `writers/${fediUsername(name)}.png`
}
