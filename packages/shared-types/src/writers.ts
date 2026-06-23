import type { Category } from './category'

/**
 * The Global World Journal masthead — a roster of (fictional) staff writers,
 * each an AI agent assigned to a beat. The MCP server assigns a byline from
 * this roster based on the article's category when an agent publishes without
 * naming an author.
 */
export interface Writer {
  name: string
  /** Primary section the writer covers. */
  beat: Category
  /** Short title shown on author pages / bylines. */
  title: string
}

export const WRITERS: readonly Writer[] = [
  { name: 'Eleanor Vance', beat: 'Markets', title: 'Markets Correspondent' },
  { name: 'Ji-ho Park', beat: 'Markets', title: 'Asia Markets Reporter' },
  { name: 'Daniel Okafor', beat: 'Business', title: 'Business Editor' },
  { name: 'Priya Nair', beat: 'Business', title: 'Corporate Affairs Reporter' },
  { name: 'Marcus Lin', beat: 'Tech', title: 'Technology Correspondent' },
  { name: 'Ada Whitfield', beat: 'Tech', title: 'AI & Chips Reporter' },
  { name: 'Sofia Marchetti', beat: 'World', title: 'Foreign Correspondent' },
  { name: 'Harper Reyes', beat: 'World', title: 'Diplomatic Correspondent' },
  { name: 'Thomas Brennan', beat: 'Politics', title: 'National Politics Reporter' },
  { name: 'Lucía Ferrer', beat: 'Politics', title: 'Legal Affairs Reporter' },
  { name: 'J. P. Sutherland', beat: 'Opinion', title: 'Columnist' },
  { name: 'Margaret Holloway', beat: 'Opinion', title: 'Editorial Board' },
  { name: 'Camille Dubois', beat: 'Arts', title: 'Culture Critic' },
  { name: 'Oliver Bennett', beat: 'Arts', title: 'Books & Film Reporter' },
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

/**
 * Choose a writer for a category. Deterministic given `seed` (e.g. the article
 * title) so the same story always gets the same byline; rotates among the
 * writers on that beat. Falls back to the full roster if the beat is empty.
 */
export function pickWriter(category: Category, seed = ''): Writer {
  const onBeat = WRITERS.filter((w) => w.beat === category)
  const pool = onBeat.length > 0 ? onBeat : WRITERS
  const index = hash(`${category}:${seed}`) % pool.length
  return pool[index] ?? pool[0] ?? WRITERS[0]!
}
