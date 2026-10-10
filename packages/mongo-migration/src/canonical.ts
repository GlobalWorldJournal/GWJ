import { createHash } from 'node:crypto'

/**
 * Canonical JSON: object keys sorted, `undefined` dropped, Dates as ISO-8601 with
 * milliseconds (Mongo's precision). Two values with the same meaning serialize to
 * the same bytes regardless of key order or of which store produced them.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value))
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(normalize)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      const v: unknown = Reflect.get(value, key)
      if (v !== undefined) out[key] = normalize(v)
    }
    return out
  }
  return value
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

export interface CanonicalRecord {
  /** Stable natural key of the record (id, username, or actorUsername+actorId). */
  key: string
  /** The record's canonical JSON. */
  json: string
}

export interface TableDigest {
  count: number
  /** sha256 over the sorted `key \t sha256(json)` lines — content identity, not just a count. */
  checksum: string
  /** Per-key row hash, for naming the records that differ. */
  rows: Map<string, string>
}

export function digest(records: readonly CanonicalRecord[]): TableDigest {
  const rows = new Map<string, string>()
  for (const r of records) {
    if (rows.has(r.key)) throw new Error(`duplicate natural key ${JSON.stringify(r.key)}`)
    rows.set(r.key, sha256(r.json))
  }
  const lines = [...rows.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, h]) => `${k}\t${h}`)
  return { count: rows.size, checksum: sha256(lines.join('\n')), rows }
}

/** Keys whose row hash differs, plus keys present on one side only. */
export function diffDigests(source: TableDigest, target: TableDigest): { changed: string[]; onlyInSource: string[]; onlyInTarget: string[] } {
  const changed: string[] = []
  const onlyInSource: string[] = []
  for (const [key, hash] of source.rows) {
    const other = target.rows.get(key)
    if (other === undefined) onlyInSource.push(key)
    else if (other !== hash) changed.push(key)
  }
  const onlyInTarget = [...target.rows.keys()].filter((k) => !source.rows.has(k))
  return { changed, onlyInSource, onlyInTarget }
}
