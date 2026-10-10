import { canonicalJson, diffDigests, digest, type TableDigest } from './canonical'
import { naturalKey, type LogicalDocument, type SourceCollection } from './normalize'
import { PORTED_COLLECTIONS } from './source'

export interface TableVerification {
  table: SourceCollection
  source: { count: number; checksum: string }
  target: { count: number; checksum: string }
  match: boolean
  /** Up to {@link MAX_NAMED} keys per kind of difference. */
  changed: string[]
  onlyInSource: string[]
  onlyInTarget: string[]
}

const MAX_NAMED = 20

function digestOf(collection: SourceCollection, docs: LogicalDocument[]): TableDigest {
  return digest(docs.map((d) => ({ key: naturalKey(collection, d), json: canonicalJson(d) })))
}

/**
 * Compare source and target by CONTENT, table by table: a count AND a checksum
 * over every row's canonical JSON. Two equal counts are not identity; the
 * checksum is. On a mismatch the differing keys are named.
 */
export function verifyTables(
  source: Record<SourceCollection, LogicalDocument[]>,
  target: Record<SourceCollection, LogicalDocument[]>,
): TableVerification[] {
  return PORTED_COLLECTIONS.map((table) => {
    const s = digestOf(table, source[table])
    const t = digestOf(table, target[table])
    const diff = diffDigests(s, t)
    return {
      table,
      source: { count: s.count, checksum: s.checksum },
      target: { count: t.count, checksum: t.checksum },
      match: s.count === t.count && s.checksum === t.checksum,
      changed: diff.changed.slice(0, MAX_NAMED),
      onlyInSource: diff.onlyInSource.slice(0, MAX_NAMED),
      onlyInTarget: diff.onlyInTarget.slice(0, MAX_NAMED),
    }
  })
}
