/**
 * Logical document → PostgreSQL insert values, validated STRICTLY.
 *
 * Every field must be one the target table has a column for; anything else is a
 * refusal naming the document and the field, never a silent drop. Each value is
 * checked against the column's type and constraint so a bad document fails here,
 * with its id, rather than as an anonymous CHECK violation mid-transaction.
 */
import {
  CATEGORIES,
  SUPPORTED_LANGUAGES,
  TakedownClaimTypeSchema,
  TakedownStatusSchema,
  type HeroImage,
  type Seo,
  type Source,
} from '@gwj/shared-types';
import type { NewArticleRow } from '@gwj/backend/src/db/schema/articles';
import type { UserRow } from '@gwj/backend/src/db/schema/users';
import type { ActorKeyRow } from '@gwj/backend/src/db/schema/actorKeys';
import type { FollowerRow } from '@gwj/backend/src/db/schema/followers';
import type { TakedownRequestRow } from '@gwj/backend/src/db/schema/takedownRequests';
import type { LogicalDocument, SourceCollection } from './normalize';

export class InvalidDocumentError extends Error {
  constructor(collection: SourceCollection, key: string, problems: string[]) {
    super(`${collection} ${key}: ${problems.join('; ')}`);
    this.name = 'InvalidDocumentError';
  }
}

const HEX24 = /^[0-9a-f]{24}$/;

class Checker {
  readonly problems: string[] = [];
  constructor(private readonly doc: LogicalDocument) {}

  only(allowed: readonly string[]): void {
    const extra = Object.keys(this.doc).filter((k) => !allowed.includes(k));
    if (extra.length > 0) this.problems.push(`fields with no target column: ${extra.join(', ')}`);
  }

  string(
    field: string,
    opts: { nullable?: boolean; nonEmpty?: boolean; pattern?: RegExp } = {},
  ): string | null {
    const v = this.doc[field];
    if (v === null && opts.nullable) return null;
    if (typeof v !== 'string') {
      this.problems.push(`${field} is ${v === null ? 'null' : typeof v}, expected string`);
      return null;
    }
    if (opts.nonEmpty && v.length === 0) this.problems.push(`${field} is empty`);
    if (opts.pattern && !opts.pattern.test(v))
      this.problems.push(`${field} ${JSON.stringify(v)} does not match ${opts.pattern}`);
    return v;
  }

  oneOf<T extends string>(field: string, values: readonly T[]): T | null {
    const v = this.doc[field];
    const match = values.find((x) => x === v);
    if (match === undefined)
      this.problems.push(`${field} ${JSON.stringify(v)} is not one of ${values.join('|')}`);
    return match ?? null;
  }

  date(field: string, opts: { nullable?: boolean } = {}): Date | null {
    const v = this.doc[field];
    if (v === null && opts.nullable) return null;
    if (!(v instanceof Date) || Number.isNaN(v.getTime())) {
      this.problems.push(`${field} is not a valid Date`);
      return null;
    }
    return v;
  }

  int(field: string, min: number): number {
    const v = this.doc[field];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min) {
      this.problems.push(`${field} ${JSON.stringify(v)} is not an integer >= ${min}`);
      return min;
    }
    return v;
  }

  stringArray(field: string): string[] {
    const v = this.doc[field];
    if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
      this.problems.push(`${field} is not an array of strings`);
      return [];
    }
    return v as string[];
  }

  /** A sub-document whose members are all optional strings from `allowed` (plus `required`). */
  subdoc(
    field: string,
    allowed: readonly string[],
    required: readonly string[] = [],
  ): Record<string, string> | null {
    const v = this.doc[field];
    if (v === null) return null;
    if (typeof v !== 'object' || Array.isArray(v) || v instanceof Date) {
      this.problems.push(`${field} is not an object`);
      return null;
    }
    const out: Record<string, string> = {};
    for (const [k, member] of Object.entries(v)) {
      if (!allowed.includes(k))
        this.problems.push(`${field}.${k} has no place in the target shape`);
      else if (typeof member !== 'string') this.problems.push(`${field}.${k} is not a string`);
      else out[k] = member;
    }
    for (const r of required) if (!(r in out)) this.problems.push(`${field}.${r} is required`);
    return out;
  }

  done(collection: SourceCollection, key: string): void {
    if (this.problems.length > 0) throw new InvalidDocumentError(collection, key, this.problems);
  }
}

/**
 * Every field an article had in MongoDB: what the copy accepts, and what
 * verification compares. Columns added since the port (derived or new) are not
 * Mongo data, so they are neither copied from nor compared against the source.
 */
export const ARTICLE_SOURCE_FIELDS = [
  'id',
  'slug',
  'title',
  'deck',
  'kicker',
  'category',
  'language',
  'author',
  'body',
  'heroImage',
  'status',
  'featured',
  'tags',
  'seo',
  'source',
  'publishedAt',
  'createdAt',
  'updatedAt',
] as const;

export function articleRow(doc: LogicalDocument): NewArticleRow {
  const c = new Checker(doc);
  c.only(ARTICLE_SOURCE_FIELDS);
  // The fields Mongo held; the derived columns are added on return.
  const row: Omit<NewArticleRow, 'translationGroupId'> = {
    id: c.string('id', { pattern: HEX24 }) ?? '',
    slug: c.string('slug', { nonEmpty: true }) ?? '',
    title: c.string('title', { nonEmpty: true }) ?? '',
    deck: c.string('deck', { nullable: true }),
    kicker: c.string('kicker', { nullable: true }),
    category: c.oneOf('category', CATEGORIES) ?? 'World',
    language: c.oneOf('language', SUPPORTED_LANGUAGES) ?? 'en',
    author: c.string('author', { nonEmpty: true }) ?? '',
    body: c.string('body', { nonEmpty: true }) ?? '',
    heroImage: c.subdoc(
      'heroImage',
      ['url', 'caption', 'credit', 'alt'],
      ['url', 'alt'],
    ) as HeroImage | null,
    status: c.oneOf('status', ['draft', 'published'] as const) ?? 'draft',
    featured: c.int('featured', 0),
    tags: c.stringArray('tags'),
    seo: (c.subdoc('seo', ['metaTitle', 'metaDescription', 'ogImage']) ?? {}) as Seo,
    source: c.subdoc('source', ['name', 'articleUrl', 'imageUrl']) as Source | null,
    publishedAt: c.date('publishedAt', { nullable: true }),
    createdAt: c.date('createdAt') ?? new Date(0),
    updatedAt: c.date('updatedAt') ?? new Date(0),
  };
  if ((row.status === 'published') !== (row.publishedAt !== null)) {
    c.problems.push(
      `status ${row.status} with publishedAt ${row.publishedAt === null ? 'null' : 'set'} (articles_published_at_check)`,
    );
  }
  c.done('articles', String(doc.id));
  // Mongo had neither. Derive them exactly as the migrations backfill existing
  // rows: a published article first went live at publishedAt (0002), and every
  // article is the only edition of its own story (0003).
  return { ...row, firstPublishedAt: row.publishedAt, translationGroupId: row.id };
}

export function userRow(doc: LogicalDocument): UserRow {
  const c = new Checker(doc);
  c.only(['id', 'username', 'passwordHash', 'role', 'createdAt']);
  const row: UserRow = {
    id: c.string('id', { pattern: HEX24 }) ?? '',
    username: c.string('username', { nonEmpty: true }) ?? '',
    // bcrypt, copied verbatim; assert the SHAPE (never print the value).
    passwordHash: c.string('passwordHash', { pattern: /^\$2[aby]\$\d{2}\$.{53}$/ }) ?? '',
    role: c.oneOf('role', ['admin'] as const) ?? 'admin',
    createdAt: c.date('createdAt') ?? new Date(0),
    // Mongo had no deactivation: every copied account is active.
    disabledAt: null,
  };
  c.done('users', String(doc.id));
  return row;
}

export function actorKeyRow(doc: LogicalDocument): ActorKeyRow {
  const c = new Checker(doc);
  c.only(['username', 'privateKeyPem', 'publicKeyPem', 'createdAt', 'updatedAt']);
  const row: ActorKeyRow = {
    username: c.string('username', { nonEmpty: true }) ?? '',
    // Secret material, copied verbatim; assert the PEM SHAPE (never print it).
    privateKeyPem:
      c.string('privateKeyPem', {
        pattern: /^-----BEGIN PRIVATE KEY-----\n[\s\S]+\n-----END PRIVATE KEY-----\n?$/,
      }) ?? '',
    publicKeyPem:
      c.string('publicKeyPem', {
        pattern: /^-----BEGIN PUBLIC KEY-----\n[\s\S]+\n-----END PUBLIC KEY-----\n?$/,
      }) ?? '',
    createdAt: c.date('createdAt') ?? new Date(0),
    updatedAt: c.date('updatedAt') ?? new Date(0),
  };
  c.done('actorkeys', String(doc.username));
  return row;
}

export type FollowerInsert = Omit<FollowerRow, 'id'>;

export function followerRow(doc: LogicalDocument): FollowerInsert {
  const c = new Checker(doc);
  c.only([
    'actorUsername',
    'actorId',
    'inbox',
    'sharedInbox',
    'followedAt',
    'createdAt',
    'updatedAt',
  ]);
  const row: FollowerInsert = {
    actorUsername: c.string('actorUsername', { nonEmpty: true }) ?? '',
    actorId: c.string('actorId', { nonEmpty: true }) ?? '',
    inbox: c.string('inbox', { nonEmpty: true }) ?? '',
    sharedInbox: c.string('sharedInbox', { nullable: true }),
    followedAt: c.date('followedAt') ?? new Date(0),
    createdAt: c.date('createdAt') ?? new Date(0),
    updatedAt: c.date('updatedAt') ?? new Date(0),
  };
  c.done('followers', `${String(doc.actorUsername)} ${String(doc.actorId)}`);
  return row;
}

export function takedownRequestRow(doc: LogicalDocument): TakedownRequestRow {
  const c = new Checker(doc);
  c.only([
    'id',
    'requesterName',
    'requesterEmail',
    'articleUrl',
    'imageUrl',
    'claimType',
    'explanation',
    'goodFaithAssertion',
    'status',
    'articleId',
    'resolution',
    'createdAt',
    'updatedAt',
  ]);
  if (doc.goodFaithAssertion !== true)
    c.problems.push('goodFaithAssertion is not true (takedown_requests_good_faith_check)');
  const row: TakedownRequestRow = {
    id: c.string('id', { pattern: HEX24 }) ?? '',
    requesterName: c.string('requesterName', { nonEmpty: true }) ?? '',
    requesterEmail: c.string('requesterEmail', { nonEmpty: true }) ?? '',
    articleUrl: c.string('articleUrl', { nullable: true }),
    imageUrl: c.string('imageUrl', { nullable: true }),
    claimType: c.oneOf('claimType', TakedownClaimTypeSchema.options) ?? 'other',
    explanation: c.string('explanation', { nonEmpty: true }) ?? '',
    goodFaithAssertion: true,
    status: c.oneOf('status', TakedownStatusSchema.options) ?? 'pending',
    articleId: c.string('articleId', { nullable: true, pattern: HEX24 }),
    resolution: c.string('resolution', { nullable: true }),
    createdAt: c.date('createdAt') ?? new Date(0),
    updatedAt: c.date('updatedAt') ?? new Date(0),
  };
  c.done('takedownrequests', String(doc.id));
  return row;
}
