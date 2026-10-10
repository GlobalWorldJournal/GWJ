/**
 * Raw Mongo document → LOGICAL document: what the Mongoose models handed the
 * application for that document. This is the source side of every comparison.
 *
 * It keeps EVERY stored field (minus the explicit drop list), so a field the copy
 * failed to carry shows up as a checksum mismatch instead of vanishing. What it
 * adds is exactly what Mongoose added on hydration, and nothing else.
 *
 * ## The audit list — every rule that changes a value, grouped by how it fails
 *
 * Dropped (never meaningful):
 *   - `__v` (Mongoose versionKey; no reader).
 *   - `_id` of `actorkeys` and `followers` (never left the database; the natural
 *     keys `username` and `(actorUsername, actorId)` identify them).
 *
 * Renamed: `_id` → `id` (24-hex string) for `articles`, `users` and
 *   `takedownrequests` — preserved because it is embedded in federated Note ids,
 *   admin URLs and JWT `sub`.
 *
 * Converted: `takedownrequests.articleId` ObjectId ref → its hex string (exactly
 *   what the DTO already exposed); absent/null stays null.
 *
 * Mongoose schema defaults (applied on hydration, so the app already saw them):
 *   - articles: language 'en', status 'draft', featured 0, tags [], seo {},
 *     heroImage.alt '' (when heroImage exists), publishedAt null.
 *   - users: role 'admin'.
 *   - takedownrequests: status 'pending'.
 *
 * Absent optional value ⇔ null (the DTO maps both to an omitted field):
 *   - articles: deck, kicker, heroImage, source; followers: sharedInbox;
 *     takedownrequests: articleUrl, imageUrl, resolution.
 *   - inside heroImage/seo/source a null member is dropped (Zod: optional).
 *
 * Non-deterministic Mongoose defaults (`default: () => new Date()` evaluated at
 * READ time) are replaced by the ObjectId's own creation second, which is when
 * the document was created — the only stable answer:
 *   - createdAt/updatedAt on every collection, followers.followedAt (falls back
 *     to createdAt first).
 *   The production census (2026-10-10) found NO document missing any of these.
 *
 * Legacy shape (the old boot-time migration, now done here):
 *   - followers without actorUsername → the default edition actor (`news`).
 *   The production census found 0 followers and 0 legacy rows.
 */
import type { Document, ObjectId } from 'mongodb'
import { DEFAULT_EDITION_USERNAMES, DEFAULT_LANGUAGE } from '@gwj/shared-types'

export type SourceCollection = 'articles' | 'users' | 'actorkeys' | 'followers' | 'takedownrequests'
export type LogicalDocument = Record<string, unknown>

const LEGACY_FOLLOWER_EDITION = DEFAULT_EDITION_USERNAMES[DEFAULT_LANGUAGE]

function objectIdOf(doc: Document): ObjectId {
  const id: unknown = doc._id
  if (id === null || typeof id !== 'object' || typeof Reflect.get(id, 'getTimestamp') !== 'function') {
    throw new Error(`document _id ${JSON.stringify(id)} is not an ObjectId`)
  }
  return id as ObjectId
}

function withoutNulls(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || value instanceof Date) return value
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) if (v !== null && v !== undefined) out[k] = v
  return out
}

function isAbsent(value: unknown): boolean {
  return value === undefined || value === null
}

export function toLogical(collection: SourceCollection, raw: Document): LogicalDocument {
  const oid = objectIdOf(raw)
  const created = oid.getTimestamp()
  const { _id: _ignoredId, __v: _ignoredVersion, ...rest } = raw
  const doc: LogicalDocument = { ...rest }

  switch (collection) {
    case 'articles': {
      doc.id = oid.toHexString()
      if (isAbsent(doc.language)) doc.language = 'en'
      if (isAbsent(doc.status)) doc.status = 'draft'
      if (isAbsent(doc.featured)) doc.featured = 0
      if (isAbsent(doc.tags)) doc.tags = []
      doc.seo = isAbsent(doc.seo) ? {} : withoutNulls(doc.seo)
      for (const key of ['deck', 'kicker'] as const) if (isAbsent(doc[key])) doc[key] = null
      if (isAbsent(doc.heroImage)) {
        doc.heroImage = null
      } else {
        const hero = withoutNulls(doc.heroImage) as Record<string, unknown>
        doc.heroImage = { alt: '', ...hero }
      }
      doc.source = isAbsent(doc.source) ? null : withoutNulls(doc.source)
      if (isAbsent(doc.publishedAt)) doc.publishedAt = null
      if (isAbsent(doc.createdAt)) doc.createdAt = created
      if (isAbsent(doc.updatedAt)) doc.updatedAt = doc.createdAt
      return doc
    }
    case 'users': {
      doc.id = oid.toHexString()
      if (isAbsent(doc.role)) doc.role = 'admin'
      if (isAbsent(doc.createdAt)) doc.createdAt = created
      return doc
    }
    case 'actorkeys': {
      if (isAbsent(doc.createdAt)) doc.createdAt = created
      if (isAbsent(doc.updatedAt)) doc.updatedAt = doc.createdAt
      return doc
    }
    case 'takedownrequests': {
      doc.id = oid.toHexString()
      const ref: unknown = doc.articleId
      if (isAbsent(ref)) doc.articleId = null
      else if (typeof ref === 'object' && ref !== null && typeof Reflect.get(ref, 'toHexString') === 'function') {
        doc.articleId = (ref as ObjectId).toHexString()
      }
      for (const key of ['articleUrl', 'imageUrl', 'resolution'] as const) if (isAbsent(doc[key])) doc[key] = null
      if (isAbsent(doc.status)) doc.status = 'pending'
      if (isAbsent(doc.createdAt)) doc.createdAt = created
      if (isAbsent(doc.updatedAt)) doc.updatedAt = doc.createdAt
      return doc
    }
    case 'followers': {
      if (isAbsent(doc.actorUsername)) doc.actorUsername = LEGACY_FOLLOWER_EDITION
      if (isAbsent(doc.sharedInbox)) doc.sharedInbox = null
      if (isAbsent(doc.createdAt)) doc.createdAt = created
      if (isAbsent(doc.updatedAt)) doc.updatedAt = doc.createdAt
      if (isAbsent(doc.followedAt)) doc.followedAt = doc.createdAt
      return doc
    }
  }
}

/** The natural key a logical document is compared by. */
export function naturalKey(collection: SourceCollection, doc: LogicalDocument): string {
  switch (collection) {
    case 'articles':
    case 'users':
    case 'takedownrequests':
      return String(doc.id)
    case 'actorkeys':
      return String(doc.username)
    case 'followers':
      return `${String(doc.actorUsername)} ${String(doc.actorId)}`
  }
}
